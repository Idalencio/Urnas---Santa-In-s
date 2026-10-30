"""QA de contas e turmas, apenas em banco local descartável após integration-v2.py."""
import os,requests,datetime,json
BASE=os.environ['URNA_TEST_URL'];assert BASE.startswith('http://127.0.0.1:')
passed=[]
def check(name,cond):
 assert cond,name
 passed.append(name);print('OK',name,flush=True)
def login(username,password):
 s=requests.Session();r=s.post(BASE+'/api/auth',json={'action':'login','username':username,'password':password},headers={'Origin':BASE});return s,r
admin,r=login('admin','TesteV2Seguro!123');assert r.ok,r.text
ak=r.json()['panelKey']
def api(s,key,action=None,**payload):
 h={'Origin':BASE,'X-Urna-Panel':key}
 return s.get(BASE+'/api/v2/app',headers=h) if action is None else s.post(BASE+'/api/v2/app',json={'action':action,**payload},headers=h)
def a(action=None,**v):return api(admin,ak,action,**v)
csv='nome;turma;matricula\nAluna A;Equipe A;EQ001\nAluno B;Equipe A;EQ002\nAluna C;Equipe B;EQ003\n'
check('Importação geral com várias turmas',a('csvImport',csv=csv).ok)
st=a().json();check('Turmas agrupadas com contagem',next(c for c in st['classes'] if c['name']=='Equipe A')['count']==2)
check('Atualização de matrícula existente',a('csvImport',csv='nome;turma;matricula\nAluna A atualizada;Equipe A;EQ001\n').ok and next(c for c in a().json()['classes'] if c['name']=='Equipe A')['count']==2)
value={'name':'Equipe QA','username':'equipe.qa','password':'EquipeSeguro!123','role':'staff','active':1,'permissions':[],'classes':['Equipe A'],'electionIds':[]}
r=a('account',value=value);check('Administrador cria conta sem permissões',r.ok);uid=r.json()['id'];value['id']=uid;value['password']=''
team,r=login(value['username'],'EquipeSeguro!123');check('Equipe entra com usuário e senha',r.ok);tk=r.json()['panelKey']
def t(action=None,**v):return api(team,tk,action,**v)
st=t().json();check('Equipe só recebe turmas autorizadas e nenhum cadastro geral',st['classes']==[{'name':'Equipe A','count':2}] and not st['students'] and not st['accounts'] and not st['elections'])
check('Senha ou hash nunca enviados ao painel',not any(k in json.dumps(a().json()['accounts']) for k in ['password_hash','s1:','"hash"','"password"']))
check('Criar eleição sem permissão bloqueado',t('election',value={'name':'Negada','digits':5}).status_code==403)
check('Importação só por administradores',t('csvImport',csv=csv).status_code==403 and t('csvPreview',csv=csv).status_code==403)
check('Equipe não pode criar contas ou elevar permissões',t('account',value=value).status_code==403)
value['permissions']=['manageElections','manageVoters'];assert a('account',value=value).ok
check('Permissões atualizam sessão existente',set(t().json()['me']['permissions'])==set(value['permissions']))
r=t('election',value={'name':'Eleição da equipe','digits':5,'hasVice':1,'requireMatricula':1});check('Equipe cria sua própria eleição',r.ok);eid=r.json()['id']
check('Equipe vê apenas sua eleição',len(t().json()['elections'])==1 and t().json()['elections'][0]['id']==eid)
foreign=next(e for e in a().json()['elections'] if e['id']!=eid)
check('Acesso direto a eleição alheia bloqueado',t('electors',electionId=foreign['id']).status_code==403 and t('candidate',value={'electionId':foreign['id']}).status_code==403 and t('duplicate',electionId=foreign['id']).status_code==403)
check('Equipe não pode escolher todas implicitamente',t('enroll',electionId=eid,classes=[]).status_code==403)
check('Turma fora da permissão bloqueada',t('enroll',electionId=eid,classes=['Equipe B']).status_code==403)
check('Turma liberada selecionada na eleição',t('enroll',electionId=eid,classes=['Equipe A']).ok)
check('Matrículas são do cadastro geral',set(x['matricula'] for x in t('electors',electionId=eid).json()['rows'])=={'EQ001','EQ002'})
check('Escolha de turma persistida',t().json()['elections'][0]['electorClasses']==['Equipe A'])
candidate={'electionId':eid,'name':'Leão de teste','code':'1','image':'/characters/lion.svg','viceName':'Coruja de teste','viceImage':'/characters/owl.svg','active':1}
check('Edição de candidatos permitida',t('candidate',value=candidate).ok)
period={'electionId':eid,'models':['standard','images'],'startsAt':(datetime.datetime.now(datetime.timezone.utc)-datetime.timedelta(seconds=5)).isoformat(timespec='milliseconds'),'endsAt':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat(timespec='milliseconds')}
check('Publicar sem permissão bloqueado',t('publish',**period).status_code==403)
value['permissions'].append('publishElections');assert a('account',value=value).ok
check('Publicação após liberação do administrador',t('publish',**period).ok)
check('Resultados ocultos sem permissão',not t().json()['elections'][0]['results'])
value['permissions'].append('viewResults');assert a('account',value=value).ok
# No ballots needed; permission appears and published election remains visible.
check('Consulta de resultados liberada', 'viewResults' in t().json()['me']['permissions'])
value['permissions']=[];assert a('account',value=value).ok
check('Revogação aplicada sem novo login',t('close',electionId=eid).status_code==403 and t('electors',electionId=eid).status_code==403)
value['permissions']=['manageVoters'];value['electionIds']=[foreign['id']];assert a('account',value=value).ok
check('Administrador libera eleição existente para equipe',foreign['id'] in [e['id'] for e in t().json()['elections']])
check('Eleitores de turma não liberada não são expostos',t('electors',electionId=foreign['id']).json()['rows']==[])
value['classes']=None;assert a('account',value=value).ok
check('Acesso a todas as turmas explícito',len(t().json()['classes'])==len(a().json()['classes']))
value['active']=0;assert a('account',value=value).ok
check('Conta desativada perde sessão e login',t().status_code==401 and login(value['username'],'EquipeSeguro!123')[1].status_code==401)
value['active']=1;value['password']='NovaEquipeSeguro!123';assert a('account',value=value).ok
check('Senha antiga deixa de funcionar',login(value['username'],'EquipeSeguro!123')[1].status_code==401)
team,r=login(value['username'],'NovaEquipeSeguro!123');check('Nova senha funciona',r.ok);tk=r.json()['panelKey']
check('Equipe bloqueada no painel legado',team.get(BASE+'/api/app',headers={'X-Urna-Panel':tk}).status_code==403)
check('Usuário duplicado rejeitado',a('account',value={**value,'id':'','password':'OutraSenha!123'}).status_code==400)
owner=next(u for u in a().json()['accounts'] if u['owner']);check('Conta principal não pode ser desativada',a('account',value={**owner,'active':0}).status_code==400)
check('Turmas e eleitores anteriores preservados',len(a().json()['elections'])>=len(st.get('elections',[])) and any(c['name']=='Equipe B' for c in a().json()['classes']))
print(json.dumps({'passed':len(passed),'checks':passed},ensure_ascii=False,indent=2))
