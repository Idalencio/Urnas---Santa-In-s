"""Cadastro manual e turmas: apenas banco local descartável."""
import os,requests,datetime,json,uuid
BASE=os.environ['URNA_TEST_URL'];assert BASE.startswith('http://127.0.0.1:');checks=[]
def check(name,cond):
 assert cond,name
 checks.append(name);print('OK',name,flush=True)
def login(username,password):
 s=requests.Session();r=s.post(BASE+'/api/auth',json={'action':'login','username':username,'password':password},headers={'Origin':BASE});return s,r
admin,r=login('admin','TesteV2Seguro!123');assert r.ok,r.text;key=r.json()['panelKey']
def api(session,panel,action=None,**v):
 h={'Origin':BASE,'X-Urna-Panel':panel}
 return session.get(BASE+'/api/v2/app',headers=h) if action is None else session.post(BASE+'/api/v2/app',json={'action':action,**v},headers=h)
def a(action=None,**v):return api(admin,key,action,**v)
def state():
 r=a();assert r.ok,r.text;return r.json()
def student(**v):return a('student',value=v)
def count(group):return next((c['count'] for c in state()['classes'] if c['name']==group),0)
def iso(n):return (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=n)).isoformat(timespec='milliseconds')
A='Manual A';B='Manual B';C='Manual C';D='Manual D'
check('Cadastro manual cria primeira turma',student(name='Aluna manual',matricula='M001',className=A).ok and count(A)==1)
check('Outro aluno entra na turma existente',student(name='Aluno manual',matricula='M002',className=A).ok and count(A)==2)
before=state()['students']
for v in [{'name':'','matricula':'M999','className':A},{'name':'Erro','matricula':'M 999','className':A},{'name':'Erro','matricula':'M999','className':''},{'name':'Erro','matricula':'M999','className':'x'*81},{'name':'Erro','matricula':'M999','className':'6\nA'}]:check('Campos inválidos recusados',a('student',value=v).status_code==400)
check('Falhas não alteram dados',state()['students']==before)
check('Matrícula duplicada não sobrescreve aluno',student(name='Duplicado',matricula='M001',className=B).status_code==409)
check('Nova turma separada por cadastro manual',student(name='Outra turma',matricula='M003',className=B).ok and count(B)==1)
check('Matrícula pode ser corrigida antes de vínculo eleitoral',student(originalMatricula='M003',name='Outra turma',matricula='000M003',className=B).ok)
check('Correção preserva zeros',any(s['matricula']=='000M003' for s in state()['students']) and not any(s['matricula']=='M003' for s in state()['students']))
check('Edição exige aluno existente',student(originalMatricula='ausente',name='Erro',matricula='ausente',className=A).status_code==404)
check('Não pode tomar matrícula alheia',student(originalMatricula='000M003',name='Erro',matricula='M001',className=B).status_code==409)
r=a('election',value={'name':'Cadastro manual QA','digits':5,'hasVice':0,'requireMatricula':1});assert r.ok,r.text;eid=r.json()['id']
assert a('candidate',value={'electionId':eid,'name':'Leão fictício','code':'1','image':'/characters/lion.svg','active':1}).ok
assert a('enroll',electionId=eid,classes=[A]).ok
assert a('publish',electionId=eid,models=['standard'],startsAt=iso(-5),endsAt=iso(3600)).ok
public=requests.Session();url=BASE+'/api/v2/urna/urna-padrao';h={'Origin':BASE}
r=public.post(url,json={'action':'authorize','electionId':eid,'matricula':'M002'},headers=h);assert r.ok,r.text
assert public.post(url,json={'requestId':str(uuid.uuid4()),'electionId':eid,'code':'1','gate':r.json()['gate']},headers=h).ok
original=a('electors',electionId=eid).json()['rows'];result=next(e for e in state()['elections'] if e['id']==eid)['results']
check('Matrícula usada aparece protegida no cadastro',next(s for s in state()['students'] if s['matricula']=='M001')['matriculaLocked']==1)
check('Matrícula vinculada não pode mudar',student(originalMatricula='M001',name='Erro',matricula='M009',className=A).status_code==409)
check('Nome e turma podem ser editados',student(originalMatricula='M001',name='Nome corrigido',matricula='M001',className=B).ok and count(A)==1 and count(B)==2)
check('Edição preserva eleitorado publicado e participação',a('electors',electionId=eid).json()['rows']==original)
user={'name':'Equipe manual QA','username':'manual.qa','password':'TurmasSeguro!123','role':'staff','active':1,'permissions':['manageVoters'],'classes':[A],'electionIds':[eid]}
assert a('account',value=user).ok
team,r=login(user['username'],user['password']);assert r.ok;tk=r.json()['panelKey']
def t(action=None,**v):return api(team,tk,action,**v)
check('Equipe não altera cadastro geral',t('student',value={'name':'Negado','matricula':'M999','className':A}).status_code==403 and t('renameClass',**{'from':A,'name':C}).status_code==403)
check('Renomear turma muda agrupamento',a('renameClass',**{'from':A,'name':C}).ok and count(A)==0 and count(C)==1)
check('Permissões acompanham renomeação',t().json()['me']['classes']==[C] and any(c['name']==C for c in t().json()['classes']))
check('Equipe mantém acesso ao eleitorado histórico',len(t('electors',electionId=eid).json()['rows'])==2)
check('Renomeação não reescreve lista publicada',a('electors',electionId=eid).json()['rows']==original)
before=state()['students'];check('Turmas existentes não são fundidas',a('renameClass',**{'from':C,'name':B}).status_code==409 and state()['students']==before)
check('Turma inexistente recusada',a('renameClass',**{'from':'ausente','name':'9A'}).status_code==404)
check('Nome vazio recusado',a('renameClass',**{'from':C,'name':''}).status_code==400)
check('Importação reconhece nome anterior',a('csvImport',csv='nome;turma;matricula\nImportado;Manual A;M004\n').ok and next(s for s in state()['students'] if s['matricula']=='M004')['className']==C)
check('Cadastro manual reconhece nome anterior',student(name='Antigo manual',matricula='M006',className=A).json()['className']==C)
check('Renomeações consecutivas mantêm permissão',a('renameClass',**{'from':C,'name':D}).ok and t().json()['me']['classes']==[D])
check('É possível voltar ao nome original',a('renameClass',**{'from':D,'name':A}).ok and t().json()['me']['classes']==[A])
r=a('duplicate',electionId=eid);assert r.ok;copy=r.json()['id'];assert a('enroll',electionId=copy,classes=[C]).ok
check('Seleção com nome antigo usa turma atual',next(e for e in state()['elections'] if e['id']==copy)['electorCount']==3)
assert student(name='Adicionado depois',matricula='M005',className=A).ok
check('Novo cadastro não muda lista selecionada silenciosamente',next(e for e in state()['elections'] if e['id']==copy)['electorCount']==3)
check('Atualizar turmas inclui novo aluno no rascunho',a('enroll',electionId=copy,classes=[A]).ok and next(e for e in state()['elections'] if e['id']==copy)['electorCount']==4)
check('Lista publicada continua fechada',next(e for e in state()['elections'] if e['id']==eid)['electorCount']==2)
check('Matrícula de rascunho também fica protegida',student(originalMatricula='M005',name='Adicionado depois',matricula='000M005',className=A).status_code==409)
check('Votos são preservados nas alterações',next(e for e in state()['elections'] if e['id']==eid)['results']==result)
check('Quem votou continua bloqueado após renomear',public.post(url,json={'action':'authorize','electionId':eid,'matricula':'M002'},headers=h).status_code==409)
check('Equipe não pode excluir aluno',t('deleteStudent',matricula='M005',className=A).status_code==403)
for payload in [{'matricula':'','className':A},{'matricula':'M005','className':''},{'matricula':'M 005','className':A}]:
 check('Exclusão valida matrícula e turma',a('deleteStudent',**payload).status_code==400)
check('Exclusão de aluno inexistente recusada',a('deleteStudent',matricula='ausente',className=A).status_code==404)
before=state()['students']
check('Turma desatualizada impede exclusão',a('deleteStudent',matricula='M005',className=B).status_code==409 and state()['students']==before)
draft_before=a('electors',electionId=copy).json()['rows']
check('Administrador exclui aluno da turma',a('deleteStudent',matricula='M005',className=A).ok and count(A)==3)
check('Excluído sai da lista e demais alunos permanecem',not any(s['matricula']=='M005' for s in state()['students']) and len(state()['students'])==len(before)-1)
check('Exclusão não muda rascunho silenciosamente',a('electors',electionId=copy).json()['rows']==draft_before)
check('Atualização explícita retira excluído do rascunho',a('enroll',electionId=copy,classes=[A]).ok and not any(s['matricula']=='M005' for s in a('electors',electionId=copy).json()['rows']))
check('Segunda exclusão é recusada',a('deleteStudent',matricula='M005',className=A).status_code==404)
check('Edição não reativa aluno excluído',student(originalMatricula='M005',name='Erro',matricula='M005',className=A).status_code==404)
check('Novo cadastro pode reativar mesma matrícula',student(name='Aluno reincluído',matricula='M005',className=C).ok and count(A)==4)
check('Reinclusão não duplica matrícula',len([s for s in state()['students'] if s['matricula']=='M005'])==1)
assert a('deleteStudent',matricula='M005',className=C).ok
check('CSV também reinclui aluno excluído',a('csvImport',csv='nome;turma;matricula\nAluno CSV;Manual A;M005\n').ok and any(s['matricula']=='M005' for s in state()['students']))
assert student(name='Aluno isolado',matricula='Msolo',className='Turma isolada QA').ok
check('Excluir último aluno remove grupo vazio',a('deleteStudent',matricula='Msolo',className='Turma isolada QA').ok and not any(c['name']=='Turma isolada QA' for c in state()['classes']))
check('Excluir eleitor que votou é permitido no cadastro',a('deleteStudent',matricula='M002',className=A).ok)
check('Exclusão preserva eleitorado publicado',a('electors',electionId=eid).json()['rows']==original)
check('Exclusão preserva votos e participação',next(e for e in state()['elections'] if e['id']==eid)['results']==result and next(e for e in state()['elections'] if e['id']==eid)['votedCount']==1)
check('Exclusão não libera segundo voto',public.post(url,json={'action':'authorize','electionId':eid,'matricula':'M002'},headers=h).status_code==409)
check('Eleitor pode ser recadastrado sem apagar histórico',student(name='Aluno recadastrado',matricula='M002',className=A).ok and next(s for s in state()['students'] if s['matricula']=='M002')['matriculaLocked']==1)
check('Recadastro não libera segundo voto',public.post(url,json={'action':'authorize','electionId':eid,'matricula':'M002'},headers=h).status_code==409)
check('Matrícula recadastrada mantém proteção eleitoral',student(originalMatricula='M002',name='Erro',matricula='M007',className=A).status_code==409)
check('Exclusão de eleitor sem voto mantém lista publicada',a('deleteStudent',matricula='M001',className=B).ok and a('electors',electionId=eid).json()['rows']==original)
check('Eleitorado publicado continua independente do cadastro',public.post(url,json={'action':'authorize','electionId':eid,'matricula':'M001'},headers=h).ok)
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
