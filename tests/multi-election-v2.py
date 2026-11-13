"""Seis eleições nas mesmas urnas, com HTTP concorrente e MySQL local descartável."""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import subprocess
import uuid

import requests

BASE = os.environ['URNA_TEST_URL']
config = Path(os.environ['URNA_CONFIG'])
assert BASE.startswith('http://127.0.0.1:') and config.parent.parent.name.startswith('urna-http-')
passed = 0


def check(label, condition):
    global passed
    assert condition, label
    passed += 1
    print('OK', label, flush=True)


admin = requests.Session()
r = admin.post(BASE + '/api/auth', json={'action': 'login', 'username': 'admin', 'password': 'TesteV2Seguro!123'}, headers={'Origin': BASE}, timeout=30)
assert r.ok, r.text
headers = {'Origin': BASE, 'X-Urna-Panel': r.json()['panelKey']}


def app(action=None, **payload):
    r = admin.get(BASE + '/api/v2/app', headers=headers, timeout=30) if action is None else admin.post(BASE + '/api/v2/app', json={'action': action, **payload}, headers=headers, timeout=30)
    assert r.ok, r.text
    return r.json()


def urn(eid=None, body=None, model='urna-padrao'):
    url = BASE + '/api/v2/urna/' + model
    return requests.get(url, params={'election': eid} if eid else {}, timeout=30) if body is None else requests.post(url, json=body, headers={'Origin': BASE}, timeout=30)


def iso(seconds):
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=seconds)).isoformat(timespec='milliseconds')


def public(token):
    r = requests.get(BASE + '/api/v2/public-tally', params={'token': token}, timeout=30)
    assert r.ok, r.text
    return r.json()


def parallel(fn, jobs):
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        return list(pool.map(fn, jobs))


class_name = 'Paralelas QA PHP'
matriculas = ['PARPHP' + str(i).zfill(3) for i in range(1, 14)]
app('csvImport', csv='nome;turma;matricula\n' + ''.join(f'Aluno paralelo {i + 1};{class_name};{m}\n' for i, m in enumerate(matriculas[:12])))
codes = ['1', '7', '12', '45', '80', '123']
ids = []
for i in range(6):
    eid = app('election', value={'name': f'Paralelas QA PHP {i + 1}', 'digits': 3, 'hasVice': 1, 'requireMatricula': 1})['id']
    ids.append(eid)
    for j, code in enumerate(codes):
        app('candidate', value={'electionId': eid, 'name': f'Candidato {i + 1}.{j + 1}', 'code': code, 'image': '/characters/lion.svg', 'viceName': f'Vice {i + 1}.{j + 1}', 'viceImage': '/characters/owl.svg', 'active': 1})
    app('enroll', electionId=eid, classes=[class_name])
    app('publish', electionId=eid, models=['standard', 'images'], startsAt=iso(-60), endsAt=iso(3600))

elections = {e['id']: e for e in app()['elections'] if e['id'] in ids}
tokens = [elections[eid]['publicToken'] for eid in ids]
check('Seis eleições publicadas sem substituir umas às outras', len(elections) == 6)
check('Seis duplas completas em cada eleição', all(len(e['candidateSnapshot']) == 6 and all(c['viceName'] and c['viceImage'] for c in e['candidateSnapshot']) for e in elections.values()))
check('Cada eleição tem link público próprio', len(set(tokens)) == 6)
for model in ['urna-padrao', 'urna-infantil']:
    choices = urn(model=model).json()
    check('As seis abertas aparecem em ' + model, set(ids) <= {e['id'] for e in choices['elections'] if e['status'] == 'active'})
    check('Urna exige escolher entre as eleições: ' + model, choices['election'] is None)
check('Apurações iniciam zeradas e independentes', all(public(t)['totals'] == {'votes': 0, 'eligible': 12, 'voted': 0} for t in tokens))

# Mesma matrícula em seis eleições. Liberação de uma nunca serve para outra.
gates = []
for i, eid in enumerate(ids):
    model = ['urna-padrao', 'urna-infantil'][i % 2]
    r = urn(body={'action': 'authorize', 'electionId': eid, 'matricula': matriculas[0]}, model=model)
    assert r.ok, r.text
    gates.append((model, r.json()['gate']))
check('Mesma matrícula pode ser liberada nas seis eleições', len(gates) == 6)
check('Liberações são diferentes por eleição', len({g for _, g in gates}) == 6)
wrong = urn(body={'action': 'vote', 'electionId': ids[0], 'code': codes[0], 'gate': gates[1][1], 'requestId': str(uuid.uuid4())})
check('Liberação de outra eleição é bloqueada', wrong.status_code == 403)

jobs = [(i, {'action': 'vote', 'electionId': eid, 'code': codes[i], 'gate': gates[i][1], 'requestId': str(uuid.uuid4())}) for i, eid in enumerate(ids)]
jobs += [(5, {**jobs[5][1], 'requestId': str(uuid.uuid4())}) for _ in range(11)]


def cast(job):
    i, ballot = job
    r = urn(body=ballot, model=gates[i][0])
    return i, ballot, r.status_code, r.json()


responses = parallel(cast, jobs)
check('Votos simultâneos não produzem erro interno', all(status in [200, 403] for _, _, status, _ in responses))
for i in range(6):
    check(f'Eleição {i + 1} registra uma única participação na corrida', sum(status == 200 for n, _, status, _ in responses if n == i) == 1)
winning = next((i, ballot) for i, ballot, status, _ in responses if i == 5 and status == 200)
replayed = parallel(cast, [winning] * 12)
check('Reenvios concorrentes são idempotentes', all(status == 200 and result.get('duplicate') is True for _, _, status, result in replayed))
check('Matrícula já utilizada não libera segunda votação', all(urn(body={'action': 'authorize', 'electionId': eid, 'matricula': matriculas[0]}, model=gates[i][0]).status_code == 409 for i, eid in enumerate(ids)))

# Totais diferentes por eleição: 1, 2, 3, 4, 5 e 6, para detectar mistura ou perda.
extra = []
for i, eid in enumerate(ids):
    for j in range(1, i + 1):
        r = urn(body={'action': 'authorize', 'electionId': eid, 'matricula': matriculas[j]}, model=gates[i][0])
        assert r.ok, r.text
        extra.append((i, {'action': 'vote', 'electionId': eid, 'code': codes[i], 'gate': r.json()['gate'], 'requestId': str(uuid.uuid4())}))
check('Quinze votos adicionais concorrentes são confirmados', all(status == 200 for _, _, status, _ in parallel(cast, extra)))
for i, token in enumerate(tokens):
    tally = public(token)
    own = elections[ids[i]]['candidateSnapshot'][i]['id']
    check(f'Apuração {i + 1} preserva total, participação e candidato corretos', tally['totals'] == {'votes': i + 1, 'eligible': 12, 'voted': i + 1} and all(c['votes'] == (i + 1 if c['id'] == own else 0) for c in tally['candidates']))

before = len(app()['students'])
app('csvImport', csv=f'nome;turma;matricula\nAluno paralelo 1 da Silva;{class_name};{matriculas[0]}\nNovo aluno paralelo;{class_name};{matriculas[12]}\n')
fresh = app()
check('Importação parcial mantém os alunos ausentes sem duplicar', len(fresh['students']) == before + 1 and len([s for s in fresh['students'] if s['className'] == class_name]) == 13)
check('Importação durante votação preserva as seis listas e os votos', all(public(t)['totals'] == {'votes': i + 1, 'eligible': 12, 'voted': i + 1} for i, t in enumerate(tokens)))

# Confere as tabelas reais, sem usar os totais calculados pela API.
code = r"""
require 'server/bootstrap.php';
if(!preg_match('/^urna_qa_[a-f0-9]{32}$/D',\Urna\config()['database']['name']))throw new RuntimeException('Banco não descartável.');
$ids=json_decode(getenv('URNA_TEST_MULTI_IDS'),true);$marks=implode(',',array_fill(0,count($ids),'?'));
echo json_encode([
 'ballots'=>\Urna\all("SELECT election_id,candidate_id,COUNT(*) total FROM v2_ballots WHERE election_id IN ($marks) GROUP BY election_id,candidate_id",$ids),
 'electors'=>\Urna\all("SELECT election_id,COUNT(*) total,SUM(voted) voted FROM v2_electors WHERE election_id IN ($marks) GROUP BY election_id",$ids),
 'columns'=>array_column(\Urna\all('SHOW COLUMNS FROM v2_ballots'),'Field'),
 'students'=>\Urna\one("SELECT COUNT(*) total,COUNT(DISTINCT matricula) unique_count FROM v2_students WHERE class_name='Paralelas QA PHP'")
]);
"""
raw = subprocess.run([os.environ.get('URNA_TEST_PHP', 'php'), '-r', code], cwd=config.parent.parent, env={**os.environ, 'URNA_TEST_MULTI_IDS': json.dumps(ids)}, text=True, capture_output=True, check=True)
db = json.loads(raw.stdout)
check('MySQL armazena exatamente 21 votos separados pelas seis eleições', len(db['ballots']) == 6 and all(int(row['total']) == ids.index(row['election_id']) + 1 and row['candidate_id'] == elections[row['election_id']]['candidateSnapshot'][ids.index(row['election_id'])]['id'] for row in db['ballots']))
check('MySQL mantém 72 habilitações e 21 participações sem duplicidade', len(db['electors']) == 6 and all(int(row['total']) == 12 and int(row['voted']) == ids.index(row['election_id']) + 1 for row in db['electors']))
check('MySQL mantém chave única de matrícula na lista atualizada', int(db['students']['total']) == int(db['students']['unique_count']) == 13)
check('Tabela de votos não armazena identidade ou matrícula', set(db['columns']) == {'id', 'election_id', 'candidate_id', 'kind'})

app('close', electionId=ids[0])
app('deleteElection', electionId=ids[0])
check('Encerrar e excluir uma eleição mantém as outras cinco abertas', set(ids[1:]) <= {e['id'] for e in urn().json()['elections'] if e['status'] == 'active'} and ids[0] not in {e['id'] for e in urn().json()['elections']})
check('Resultado excluído segue preservado no link público', public(tokens[0])['election']['status'] == 'closed' and public(tokens[0])['totals']['votes'] == 1)
history = admin.get(BASE + '/api/v2/election-history', headers=headers, timeout=30).json()['rows']
check('Arquivo administrativo conserva as seis eleições e seus 21 votos', len([e for e in history if e['id'] in ids]) == 6 and sum(e['voteCount'] for e in history if e['id'] in ids) == 21)
print(f'Múltiplas eleições PHP: {passed} verificações aprovadas. 6 eleições, 36 duplas, 72 habilitações e 21 votos válidos.', flush=True)
