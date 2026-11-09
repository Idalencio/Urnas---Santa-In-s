"""Executa as suites existentes somente em cópia local e banco descartável.

O runner não lê as configurações reais da instalação. As credenciais MySQL locais
chegam pelo ambiente; o banco recebe um nome aleatório criado por esta execução.
"""

import contextlib
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get("URNA_TEST_PHP", "php")
DB_HOST = os.environ.get("URNA_TEST_DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("URNA_TEST_DB_PORT", "3306"))
if DB_HOST not in {"127.0.0.1", "localhost"}:
    raise SystemExit("O runner aceita somente MariaDB/MySQL local e exclusivo de testes.")

DB_NAME = "urna_qa_" + uuid.uuid4().hex
TEST_PASSWORD = "TesteV2Seguro!123"  # Fictícia e restrita ao banco descartável.

with tempfile.TemporaryDirectory(prefix="urna-http-") as temporary:
    qa = Path(temporary)
    for folder in ("bin", "config", "database", "public", "server"):
        shutil.copytree(ROOT / folder, qa / folder, ignore=shutil.ignore_patterns(
            "config.php", "local-admin.php", "node_modules", "*.log"
        ))
    (qa / "storage/uploads").mkdir(parents=True)
    with socket.socket() as available:
        available.bind(("127.0.0.1", 0))
        port = available.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "URNA_CONFIG": str(qa / "config/config.php"),
        "URNA_TEST_URL": url,
        "URNA_QA_NAME": DB_NAME,
        "URNA_QA_URL": url,
        "URNA_TEST_DB_HOST": DB_HOST,
        "URNA_TEST_DB_PORT": str(DB_PORT),
        "PHP_CLI_SERVER_WORKERS": "4",
    }
    (qa / "config/config.php").write_text("""<?php
return [
 'app_url'=>getenv('URNA_QA_URL'), 'environment'=>'local',
 'database'=>[
  'host'=>getenv('URNA_TEST_DB_HOST'), 'port'=>(int)getenv('URNA_TEST_DB_PORT'),
  'name'=>getenv('URNA_QA_NAME'), 'user'=>getenv('URNA_TEST_DB_USER')?:'root',
  'password'=>getenv('URNA_TEST_DB_PASSWORD')?:'',
 ],
];
""")

    def php(code):
        result = subprocess.run([PHP, "-r", code], cwd=qa, env=env,
                                text=True, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result

    connection = r"""
    require 'server/bootstrap.php';
    $d=\Urna\config()['database'];$name=$d['name'];
    if(!preg_match('/^urna_qa_[a-f0-9]{32}$/D',$name))throw new RuntimeException('Banco inválido.');
    $pdo=new PDO('mysql:host='.$d['host'].';port='.$d['port'].';charset=utf8mb4',
      $d['user'],$d['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    """
    subprocess.run([PHP, str(ROOT / "tests/totp.php")], env=env, check=True)
    created = False
    server = None
    try:
        php(connection + "$pdo->exec('CREATE DATABASE `'.$name.'` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');")
        created = True

        # A configuração inicial não deve aceitar confirmação divergente nem
        # substituir uma credencial já existente, mesmo em chamadas repetidas.
        command = [PHP, "bin/console.php", "init-admin"]
        invalid = subprocess.run(command, cwd=qa, env=env, input=TEST_PASSWORD + "\noutra senha\n",
                                 text=True, capture_output=True)
        assert invalid.returncode != 0 and not (qa / "config/local-admin.php").exists()
        valid = subprocess.run(command, cwd=qa, env=env,
                               input=(TEST_PASSWORD + "\n") * 2, text=True, capture_output=True)
        assert valid.returncode == 0, valid.stderr
        assert TEST_PASSWORD not in valid.stdout + valid.stderr
        initial = (qa / "config/local-admin.php").read_bytes()
        repeated = subprocess.run(command, cwd=qa, env=env, input="", text=True, capture_output=True)
        assert repeated.returncode != 0 and (qa / "config/local-admin.php").read_bytes() == initial
        print("OK Configuração inicial: confirmação, entrada privada e preservação de credenciais.", flush=True)

        php(r"""
        require 'server/bootstrap.php';require 'server/auth.php';
        foreach(explode(';',file_get_contents('database/001_initial.sql')) as $s)
          if(trim($s))\Urna\db()->exec($s);
        \Urna\sql('INSERT INTO schema_migrations VALUES (?,?)',['001_initial.sql',\Urna\now()]);
        $hash=\Urna\localAdminConfig()['password_hash'];
        \Urna\sql("INSERT INTO administrators (id,name,email,role,active,owner) VALUES ('csi-admin-local','Admin teste','teste@example.com','admin',1,1)");
        \Urna\sql("INSERT INTO admin_passwords VALUES ('csi-admin-local',?,1,?)",[$hash,\Urna\now()]);
        \Urna\sql("INSERT INTO terminals VALUES ('urna-padrao','Padrão','Legado','standard'),('urna-infantil','Infantil','Legado','images')");
        \Urna\sql("INSERT INTO candidates VALUES ('legacy-c','urna-padrao','Legado','01','',1)");
        \Urna\sql("INSERT INTO elections (id,name,terminal_id,starts_at,ends_at,closed,candidate_snapshot,digits) VALUES ('legacy-e','Eleição antiga','urna-padrao',?,?,1,?,2)",
          [\Urna\now(-3600),\Urna\now(-1800),json_encode([['id'=>'legacy-c','name'=>'Legado','code'=>'01','image'=>'','active'=>1]])]);
        \Urna\sql("INSERT INTO ballots VALUES (?, 'legacy-e','legacy-c','valid')",[\Urna\uuid()]);
        """)
        with open(qa / "php.log", "w") as log:
            server = subprocess.Popen([PHP, "-S", f"127.0.0.1:{port}", "-t", "public", "bin/dev-router.php"],
                                      cwd=qa, env=env, stdout=log, stderr=log, start_new_session=True)
            for attempt in range(50):
                if server.poll() is not None:
                    raise RuntimeError("O servidor PHP de teste não iniciou.")
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("O servidor PHP local não respondeu.")
            for suite in ("integration-v2.py", "access-v2.py", "roster-v2.py", "delete-election-v2.py", "import-v2.py", "tally-v2.py", "security-v2.py"):
                subprocess.run([os.sys.executable, str(ROOT / "tests" / suite)], env=env, check=True)
        php(r"""
        require 'server/bootstrap.php';require 'server/auth.php';require 'server/v2.php';require 'server/access-v2.php';require 'server/roster-v2.php';
        $before=\Urna\one('SELECT COUNT(*) n FROM v2_students')['n'];
        \Urna\db()->exec("CREATE TRIGGER reject_audit BEFORE INSERT ON admin_audit FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='audit unavailable'");
        \Urna\auditPrepare(['id'=>'csi-admin-local','name'=>'QA'],'student',[],['matricula'=>'ROLLBACK001']);
        $failed=false;
        try{\Urna\v2SaveStudent(['name'=>'Não confirmar','matricula'=>'ROLLBACK001','className'=>'QA']);}catch(Throwable $e){$failed=true;}
        if(!$failed || \Urna\one('SELECT COUNT(*) n FROM v2_students')['n']!==$before)throw new RuntimeException('Rollback do histórico falhou.');
        unset($GLOBALS['urna_audit']);
        \Urna\db()->exec('DROP TRIGGER reject_audit');
        $secret=\Urna\mfaBase32(random_bytes(20));$encrypted=\Urna\mfaEncrypt($secret);
        if(str_contains($encrypted,$secret) || \Urna\mfaDecrypt($encrypted)!==$secret)throw new RuntimeException('Criptografia MFA falhou.');
        $failed=false;$raw=base64_decode(substr($encrypted,3));$raw[12]=chr(ord($raw[12])^1);
        try{\Urna\mfaDecrypt('v1:'.base64_encode($raw));}catch(Throwable $e){$failed=true;}
        if(!$failed)throw new RuntimeException('Integridade da cifra falhou.');
        echo "OK Segurança de armazenamento: rollback real do histórico, cifragem e detecção de adulteração.\n";
        """)
        cancelled = subprocess.run([PHP,"bin/console.php","reset-mfa","admin"], cwd=qa, env=env,
                                   input="CANCELAR\n", text=True, capture_output=True)
        assert cancelled.returncode != 0, "Reset de MFA sem confirmação."
        reset = subprocess.run([PHP,"bin/console.php","reset-mfa","admin"], cwd=qa, env=env,
                               input="REDEFINIR\n", text=True, capture_output=True)
        assert reset.returncode == 0, reset.stderr
        php(r"""
        require 'server/bootstrap.php';
        if(!\Urna\one("SELECT id FROM admin_audit WHERE actor_id='console' AND action='mfaReset'"))throw new RuntimeException('Reset MFA sem histórico.');
        if(\Urna\one("SELECT id FROM admin_sessions WHERE admin_id='csi-admin-local'"))throw new RuntimeException('Reset MFA não encerrou sessões.');
        """)
        print("OK Recuperação pelo console: confirmação, histórico e revogação de sessões.", flush=True)
        print("OK Suites HTTP concluídas em banco local descartável.", flush=True)
    finally:
        if server is not None:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(server.pid, signal.SIGTERM)
            with contextlib.suppress(subprocess.TimeoutExpired):
                server.wait(timeout=5)
        if created:
            php(connection + "$pdo->exec('DROP DATABASE `'.$name.'`');")
