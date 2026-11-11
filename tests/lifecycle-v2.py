"""Ciclo completo da eleição, apenas no banco temporário criado por run-http.py."""
import datetime
import json
import os
import time
import uuid
import requests

BASE = os.environ['URNA_TEST_URL']
assert BASE.startswith('http://127.0.0.1:')
passed = 0

def check(label, condition):
    global passed
    assert condition, label
    passed += 1
    print('OK', label, flush=True)

def login(username, password):
    session = requests.Session()
    response = session.post(BASE + '/api/auth', json={'action': 'login', 'username': username, 'password': password}, headers={'Origin': BASE})
    assert response.ok, response.text
    return session, {'Origin': BASE, 'X-Urna-Panel': response.json()['panelKey']}

admin, ah = login('admin', 'TesteV2Seguro!123')

def api(session, headers, action=None, **payload):
    if action is None:
        return session.get(BASE + '/api/v2/app', headers=headers, timeout=20)
    return session.post(BASE + '/api/v2/app', json={'action': action, **payload}, headers=headers, timeout=20)

def app(action=None, **payload):
    return api(admin, ah, action, **payload)

def iso(seconds):
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=seconds)).isoformat(timespec='milliseconds')

assert app('csvImport', csv='nome;turma;matricula\nAluno privado A;Seleção PHP;CIC001\nAluna privada B;Seleção PHP;CIC002\nAluno privado C;Seleção PHP;CIC003\nOutro aluno;Outra PHP;CIC004\n').ok
value = {'name': 'Organizador ciclo PHP', 'username': 'ciclo.php', 'password': 'SenhaCicloPHP!42', 'role': 'staff', 'active': 1, 'permissions': ['manageElections'], 'classes': ['Seleção PHP'], 'electionIds': []}
r = app('account', value=value)
assert r.ok, r.text
aid = r.json()['id']
staff, sh = login(value['username'], value['password'])

def team(action=None, **payload):
    return api(staff, sh, action, **payload)

create = {'name': 'Ciclo completo PHP', 'digits': 3, 'hasVice': 1, 'requireMatricula': 1}
r = team('election', value=create)
assert r.ok, r.text
eid = r.json()['id']
foreign = app('election', value={**create, 'name': 'Eleição de outra pessoa'}).json()['id']
assert app('account', value={**value, 'id': aid, 'password': '', 'electionIds': [foreign]}).ok
check('Permissão única inclui todo o fluxo', len(team().json()['me']['permissions']) == 4)
check('Equipe vê somente a própria eleição', [e['id'] for e in team().json()['elections']] == [eid])
check('Matrículas de outra eleição não são consultáveis', team('roster', electionId=foreign).status_code == 403)
rows = team('roster', electionId=eid).json()['rows']
check('Seleção retorna apenas turma autorizada', len(rows) == 3 and all(r['className'] == 'Seleção PHP' for r in rows))
check('Seleciona turma completa', team('enroll', electionId=eid, classes=['Seleção PHP']).ok)
check('Seleção individual aceita desmarcar sem duplicar', team('enroll', electionId=eid, classes=['Seleção PHP'], matriculas=['CIC001', 'CIC002', 'CIC002']).ok and len(team('electors', electionId=eid).json()['rows']) == 2)
check('Não permite aluno fora da turma', team('enroll', electionId=eid, classes=['Seleção PHP'], matriculas=['CIC004']).status_code == 403)
check('Seleção inválida preserva alunos anteriores', len(team('electors', electionId=eid).json()['rows']) == 2)
check('Pode desmarcar todos no preparo', team('enroll', electionId=eid, classes=[], matriculas=[]).ok and not team('electors', electionId=eid).json()['rows'])
assert team('enroll', electionId=eid, classes=['Seleção PHP'], matriculas=['CIC001', 'CIC003']).ok
png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iOc0AAAAASUVORK5CYII='
photo = team('image', imageData=png).json()['image']
private_photo = app('image', imageData=png).json()['image']
candidate = {'electionId': eid, 'name': 'Candidato PHP', 'code': '7', 'image': photo, 'viceName': 'Vice PHP', 'viceImage': '/characters/owl.svg', 'active': 1}
assert team('candidate', value=candidate).ok
period = {'electionId': eid, 'models': ['standard', 'images'], 'startsAt': iso(600), 'endsAt': iso(3600)}
check('Equipe publica agendamento completo', team('publish', **period).ok)
e = next(e for e in team().json()['elections'] if e['id'] == eid)
link = e['publicToken']
check('Link público tem 256 bits aleatórios', len(link) == 64 and all(c in '0123456789abcdef' for c in link))

def public():
    return requests.get(BASE + '/api/v2/public-tally', params={'token': link}, timeout=20)

r = public()
check('Apuração pública sem login', r.ok and r.json()['election']['status'] == 'scheduled')
check('Foto da apuração agendada abre pelo link público', requests.get(BASE + r.json()['candidates'][0]['image']).ok)
check('Link não dá acesso a foto de outra eleição', requests.get(BASE + private_photo + '?tally=' + link).status_code == 403)
check('Apuração não expõe nomes ou matrículas dos alunos', all(v not in r.text for v in ['CIC001', 'Aluno privado', 'gateHash', 'students', 'electors']))
check('Token desconhecido não enumera eleição', requests.get(BASE + '/api/v2/public-tally?token=' + '0' * 64).status_code == 404)
check('ID interno não abre apuração pública', requests.get(BASE + '/api/v2/public-tally?election=' + eid).status_code == 404)
check('Apuração pública não aceita escrita', requests.post(BASE + '/api/v2/public-tally?token=' + link, json={}).status_code == 405)
check('Painel continua privado', requests.get(BASE + '/api/v2/app').status_code == 401)
check('Arquivo requer sessão administrativa', requests.get(BASE + '/api/v2/election-history').status_code == 401 and staff.get(BASE + '/api/v2/election-history', headers=sh).status_code == 403)
check('Histórico também bloqueia equipe', staff.get(BASE + '/api/v2/audit', headers=sh).status_code == 403)
for action, payload in [('student', {'value': {'name': 'Negado', 'matricula': 'CIC999', 'className': 'Seleção PHP'}}), ('renameClass', {'from': 'Seleção PHP', 'name': 'Nova'}), ('account', {'value': value}), ('csvImport', {'csv': 'x'}), ('deleteStudent', {'matricula': 'CIC001'})]:
    check('Organizador não administra ' + action, team(action, **payload).status_code == 403)
check('Agendada permite alterar configuração', team('election', value={**create, 'id': eid, 'name': 'Agendada PHP atualizada'}).ok)
candidate.update(id=e['candidates'][0]['id'], code='8', name='Candidato atualizado', viceName='Vice atualizado')
check('Agendada permite alterar candidato e vice', team('candidate', value=candidate).ok)
check('Apuração reflete candidato e vice atualizados', public().json()['candidates'][0]['code'] == '8' and public().json()['candidates'][0]['viceName'] == 'Vice atualizado')
check('Agendada permite desmarcar aluno', team('enroll', electionId=eid, classes=['Seleção PHP'], matriculas=['CIC001']).ok)
check('Não deixa agendada sem eleitores', team('enroll', electionId=eid, classes=[], matriculas=[]).status_code == 400 and public().json()['totals']['eligible'] == 1)
check('Não deixa agendada sem candidatos', team('candidate', value={**candidate, 'active': 0}).status_code == 400)
# Reagendamento para já: mesma trava, sem esperar minutos reais pelo relógio.
check('Agendada pode abrir antes do horário', team('publish', **{**period, 'startsAt': iso(-1)}).ok)
check('Abrir preserva link compartilhado', next(e for e in team().json()['elections'] if e['id'] == eid)['publicToken'] == link)
check('Apuração acompanha abertura', public().json()['election']['status'] == 'active')
for action, payload in [('election', {'value': {**create, 'id': eid}}), ('candidate', {'value': candidate}), ('enroll', {'electionId': eid, 'classes': ['Seleção PHP'], 'matriculas': ['CIC001', 'CIC002']}), ('publish', {**period, 'startsAt': iso(600)})]:
    check('Aberta bloqueia ' + action, team(action, **payload).status_code == 409)
urna = BASE + '/api/v2/urna/urna-padrao'
check('Aluno desmarcado não libera a urna', not requests.post(urna, json={'action': 'authorize', 'electionId': eid, 'matricula': 'CIC003'}, headers={'Origin': BASE}).ok)
r = requests.post(urna, json={'action': 'authorize', 'electionId': eid, 'matricula': 'CIC001'}, headers={'Origin': BASE})
check('Aluno selecionado libera a urna', r.ok)
ballot = {'action': 'vote', 'electionId': eid, 'code': '8', 'gate': r.json()['gate'], 'requestId': str(uuid.uuid4())}
check('Voto válido registrado', requests.post(urna, json=ballot, headers={'Origin': BASE}).ok)
check('Reenvio não duplica voto', requests.post(urna, json=ballot, headers={'Origin': BASE}).ok and public().json()['totals']['votes'] == 1)
check('Mesmo aluno não vota novamente', requests.post(urna, json={'action': 'authorize', 'electionId': eid, 'matricula': 'CIC001'}, headers={'Origin': BASE}).status_code == 409)
check('Votação ativa não pode ser excluída', team('deleteElection', electionId=eid).status_code == 409)
check('Organizador encerra própria eleição', team('close', electionId=eid).ok)
check('Foto continua disponível após encerramento', requests.get(BASE + public().json()['candidates'][0]['image']).ok)
check('Apuração mostra resultado final', public().json()['election']['status'] == 'closed' and public().json()['totals']['votes'] == 1)
check('Organizador exclui encerrada das listas', team('deleteElection', electionId=eid).ok)
check('Excluída sai das listas de trabalho', not any(e['id'] == eid for e in app().json()['elections']) and not any(e['id'] == eid for e in team().json()['elections']))
r = admin.get(BASE + '/api/v2/election-history', headers=ah)
archived = next(e for e in r.json()['rows'] if e['id'] == eid)
check('Arquivo conserva eleição excluída e votos', r.ok and archived['deletedAt'] and archived['voteCount'] == 1)
check('Arquivo também inclui eleições não excluídas', any(e['id'] == foreign and not e['deletedAt'] for e in r.json()['rows']))
check('Administrador consulta resultado excluído', admin.get(BASE + '/api/v2/tally?election=' + eid, headers=ah).json()['totals']['votes'] == 1)
check('Equipe perde gerenciamento de excluída', staff.get(BASE + '/api/v2/tally?election=' + eid, headers=sh).status_code == 403)
check('Link compartilhado conserva resultado final após exclusão', public().json()['totals']['votes'] == 1)
cancelled = team('election', value={'name': 'Agendada para excluir', 'digits': 2, 'hasVice': 0, 'requireMatricula': 0}).json()['id']
assert team('candidate', value={'electionId': cancelled, 'name': 'Candidato cancelado', 'code': '1', 'active': 1}).ok
assert team('publish', electionId=cancelled, models=['standard'], startsAt=iso(3), endsAt=iso(3600)).ok
cancelled_link = next(e for e in team().json()['elections'] if e['id'] == cancelled)['publicToken']
check('Pode excluir agendada sem votos', team('deleteElection', electionId=cancelled).ok)
time.sleep(3.2)
check('Agendada excluída não reabre na urna', requests.get(urna, params={'election': cancelled}).status_code == 409)
check('Agendada excluída não recebe votos', requests.post(urna, json={'action': 'vote', 'electionId': cancelled, 'code': '1', 'requestId': str(uuid.uuid4())}, headers={'Origin': BASE}).status_code == 409)
check('Apuração de agendada excluída fica encerrada', requests.get(BASE + '/api/v2/public-tally?token=' + cancelled_link).json()['election']['status'] == 'closed')
print(f'Ciclo da eleição PHP: {passed} verificações aprovadas.')
