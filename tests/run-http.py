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
        return subprocess.run([PHP, "-r", code], cwd=qa, env=env, check=True,
                              text=True, capture_output=True)

    connection = r"""
    require 'server/bootstrap.php';
    $d=\Urna\config()['database'];$name=$d['name'];
    if(!preg_match('/^urna_qa_[a-f0-9]{32}$/D',$name))throw new RuntimeException('Banco inválido.');
    $pdo=new PDO('mysql:host='.$d['host'].';port='.$d['port'].';charset=utf8mb4',
      $d['user'],$d['password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    """
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
            for suite in ("integration-v2.py", "access-v2.py", "roster-v2.py"):
                subprocess.run([os.sys.executable, str(ROOT / "tests" / suite)], env=env, check=True)
        print("OK Suites HTTP concluídas em banco local descartável.", flush=True)
    finally:
        if server is not None:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(server.pid, signal.SIGTERM)
            with contextlib.suppress(subprocess.TimeoutExpired):
                server.wait(timeout=5)
        if created:
            php(connection + "$pdo->exec('DROP DATABASE `'.$name.'`');")
