"""Exclusão de rascunhos: roda somente após as suites no banco local descartável."""
import os, requests, datetime, concurrent.futures
BASE=os.environ['URNA_TEST_URL']; assert BASE.startswith('http://127.0.0.1:')
s=requests.Session();h={'Origin':BASE};passed=0
r=s.post(BASE+'/api/auth',json={'action':'login','username':'admin','password':'TesteV2Seguro!123'},headers=h);assert r.ok,r.text
h['X-Urna-Panel']=r.json()['panelKey']
def app(action=None,**v):
 return s.post(BASE+'/api/v2/app',json={'action':action,**v},headers=h,timeout=20) if action else s.get(BASE+'/api/v2/app',headers=h,timeout=20)
def check(label,condition):
 global passed
 assert condition,label
 passed+=1;print('OK',label,flush=True)
def create():
 r=app('election',value={'name':'Rascunho para excluir','digits':3,'hasVice':0,'requireMatricula':1});assert r.ok,r.text
 eid=r.json()['id']
 assert app('candidate',value={'electionId':eid,'name':'Candidato teste','code':'7','active':1,'image':'/characters/lion.svg'}).ok
 assert app('enroll',electionId=eid,classes=['Exclusão QA']).ok
 return eid
def remove(eid):return app('deleteElection',electionId=eid)
assert app('student',value={'name':'Aluno preservado','matricula':'DEL001','className':'Exclusão QA'}).ok
initial=app().json();published=next(e for e in initial['elections'] if e['published'])
check('Publicada não pode ser excluída',remove(published['id']).status_code==409)
eid=create()
value={'name':'Equipe exclusão','username':'exclusao.qa','password':'TesteExcluir!123','role':'staff','active':1,'permissions':[],'classes':None,'electionIds':[eid]}
r=app('account',value=value);assert r.ok,r.text;value['id']=r.json()['id']
t=requests.Session();r=t.post(BASE+'/api/auth',json={'action':'login','username':value['username'],'password':value['password']},headers={'Origin':BASE});assert r.ok,r.text
th={'Origin':BASE,'X-Urna-Panel':r.json()['panelKey']}
def team_remove(target):return t.post(BASE+'/api/v2/app',json={'action':'deleteElection','electionId':target},headers=th,timeout=20)
check('Sem permissão não exclui rascunho atribuído',team_remove(eid).status_code==403)
value.update(password='',permissions=['manageElections']);assert app('account',value=value).ok
foreign=create();check('Permissão não libera eleição alheia',team_remove(foreign).status_code==403)
before=app().json();check('Equipe autorizada exclui rascunho atribuído',team_remove(eid).ok)
after=app().json()
check('Rascunho sai do painel',not any(e['id']==eid for e in after['elections']))
check('Cadastro geral preservado',before['students']==after['students'])
check('Urnas preservadas',before['terminals']==after['terminals'])
check('Outras eleições preservadas',[e for e in before['elections'] if e['id']!=eid]==after['elections'])
check('Atribuição removida',eid not in next(a for a in after['accounts'] if a['id']==value['id'])['electionIds'])
check('Exclusão repetida recusada',remove(eid).status_code==404)
check('Eleição desconhecida recusada',remove('inexistente').status_code==404)
closed=create();assert app('close',electionId=closed).ok
check('Encerrada não pode ser excluída',remove(closed).status_code==409)
# A mesma trava de eleição precisa serializar publicação e exclusão.
race=create()
period={'electionId':race,'models':['standard'],'startsAt':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=5)).isoformat(timespec='milliseconds'),'endsAt':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat(timespec='milliseconds')}
cookies=s.cookies.get_dict()
def parallel(action,payload):
 return requests.post(BASE+'/api/v2/app',json={'action':action,**payload},headers=h,cookies=cookies,timeout=20)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 futures=[pool.submit(parallel,'publish',period),pool.submit(parallel,'deleteElection',{'electionId':race})]
 outcomes=[f.result() for f in futures]
check('Publicar e excluir concorrentemente: só uma ação vence',sum(r.ok for r in outcomes)==1)
survivor=next((e for e in app().json()['elections'] if e['id']==race),None)
check('Resultado concorrente consistente',survivor is None or survivor['published']==1)
check('Administrador exclui rascunho',remove(foreign).ok)
print(f'Exclusão PHP: {passed} verificações aprovadas.')
