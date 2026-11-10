"""Proteção de dados e histórico somente para administradores, em banco descartável."""
import os, requests, uuid, datetime, json, base64
BASE=os.environ['URNA_TEST_URL'];assert BASE.startswith('http://127.0.0.1:')
ORIGIN={'Origin':BASE};passed=0
PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tNEAAAAASUVORK5CYII='
def check(name,condition):
 global passed
 assert condition,name
 passed+=1;print('OK',name,flush=True)
def login(name,password):
 s=requests.Session();r=s.post(BASE+'/api/auth',json={'action':'login','username':name,'password':password},headers=ORIGIN,timeout=20);assert r.ok,r.text
 return s,{**ORIGIN,'X-Urna-Panel':r.json()['panelKey']},r
owner,H,r=login('admin','TesteV2Seguro!123')
check('Login usa apenas usuário e senha',not r.json().get('mfaRequired') and bool(r.json()['panelKey']))
def call(action,session=owner,headers=H,**payload):return session.post(BASE+'/api/v2/app',json={'action':action,**payload},headers=headers,timeout=20)
def app(action,**payload):
 r=call(action,**payload);assert r.ok,r.text;return r.json()
def account(name):
 username=name+'.'+uuid.uuid4().hex[:7];password='FicticiaPrivacidade!42'
 id=app('account',value={'name':name,'username':username,'password':password,'role':'staff','active':1,'permissions':['manageElections','manageVoters','publishElections','viewResults'],'classes':None,'electionIds':[]})['id']
 session,headers,_=login(username,password);return id,session,headers,username,password
for action in ['mfaStatus','mfaBegin','mfaConfirm','mfaRecovery','mfaDisable']:
 r=owner.post(BASE+'/api/auth',json={'action':action},headers=H)
 check('Operação de segundo fator removida: '+action,r.status_code in [400,410])
aid,staff,SH,username,password=account('Equipe')
otherid,other,OH,_,_=account('OutraEquipe')
r=staff.get(BASE+'/api/v2/app',headers=SH);assert r.ok,r.text;state=r.json()
check('Equipe não recebe cadastro geral nem contas',state['students']==[] and state['accounts']==[])
check('Histórico bloqueado mesmo com todas as permissões de equipe',staff.get(BASE+'/api/v2/audit',headers=SH).status_code==403)
check('Filtro não contorna a restrição do histórico',staff.get(BASE+'/api/v2/audit?action=account&actor='+aid,headers=SH).status_code==403)
check('Histórico exige login',requests.get(BASE+'/api/v2/audit').status_code==401)
check('Histórico exige chave da aba',owner.get(BASE+'/api/v2/audit').status_code==401)
check('Histórico não aceita escrita',owner.post(BASE+'/api/v2/audit',json={},headers=H).status_code==405)
r=owner.get(BASE+'/api/v2/audit',headers=H);check('Administrador pode consultar o histórico',r.ok and 'rows' in r.json() and r.headers.get('Cache-Control')=='no-store')
# Private photos must be scoped both for reading and when attaching a candidate.
image=app('image',imageData='data:image/png;base64,'+PNG)['image'];check('Administrador lê foto enviada',owner.get(BASE+image,headers=H).ok)
check('Foto sem vínculo não é pública',requests.get(BASE+image).status_code==403)
private=app('election',value={'name':'Privada QA','digits':2,'hasVice':0,'requireMatricula':0})['id']
app('candidate',value={'electionId':private,'name':'Privado','code':'1','image':image,'viceName':'','viceImage':'','active':1})
check('Equipe não lê foto de eleição alheia',staff.get(BASE+image,headers=SH).status_code==403)
r=call('election',session=staff,headers=SH,value={'name':'Da equipe','digits':2,'hasVice':0,'requireMatricula':0});assert r.ok,r.text;eid=r.json()['id']
r=call('candidate',session=staff,headers=SH,value={'electionId':eid,'name':'Tentativa','code':'1','image':image,'viceName':'','viceImage':'','active':1});check('Equipe não associa foto privada alheia',r.status_code in [400,403])
r=call('image',session=staff,headers=SH,imageData='data:image/png;base64,'+PNG);assert r.ok,r.text;own_image=r.json()['image']
check('Prévia da foto do próprio envio funciona',staff.get(BASE+own_image,headers=SH).ok)
check('Outro usuário não lê envio sem vínculo',other.get(BASE+own_image,headers=OH).status_code==403)
r=call('candidate',session=staff,headers=SH,value={'electionId':eid,'name':'Chapa','code':'1','image':own_image,'viceName':'','viceImage':'','active':1});assert r.ok,r.text
r=owner.get(BASE+own_image,headers=H);check('Fotos não ficam em cache',r.headers.get('Cache-Control')=='no-store' and r.headers.get('X-Content-Type-Options')=='nosniff')
# Files with active content cannot masquerade as images.
for mime,content in [('image/png',b'<html><script>alert(1)</script></html>'),('image/jpeg',b'<?php echo 1; ?>'),('image/webp',b'<svg xmlns="http://www.w3.org/2000/svg"/>')]:
 r=call('image',imageData='data:'+mime+';base64,'+base64.b64encode(content).decode());check('Upload falso recusado: '+mime,r.status_code==400)
check('SVG enviado diretamente é recusado',call('image',imageData='data:image/svg+xml;base64,'+base64.b64encode(b'<svg/>').decode()).status_code==400)
# Privacy on the public voter authorization response.
app('csvImport',csv='nome;turma;matricula\nNome Privado QA;Turma Privada QA;PRIV001\n')
public=app('election',value={'name':'Votação Privacidade','digits':2,'hasVice':0,'requireMatricula':1})['id']
app('candidate',value={'electionId':public,'name':'Chapa pública','code':'1','image':image,'viceName':'','viceImage':'','active':1});app('enroll',electionId=public,classes=['Turma Privada QA'])
iso=lambda d:(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=d)).isoformat(timespec='milliseconds')
app('publish',electionId=public,models=['standard'],startsAt=iso(-60),endsAt=iso(3600))
r=requests.get(BASE+'/api/v2/urna/urna-padrao',params={'election':public});assert r.ok,r.text;raw=r.text
check('Urna pública não expõe lista de alunos nem credenciais',not any(x in raw for x in ['PRIV001','Nome Privado QA','Turma Privada QA','password','panelKey','gateHash','students','electors']))
r=requests.post(BASE+'/api/v2/urna/urna-padrao',json={'action':'authorize','electionId':public,'matricula':'PRIV001'},headers=ORIGIN);assert r.ok,r.text
check('Liberação pública não devolve nome ou turma',set(r.json())=={'ok','gate','expiresIn'})
check('Foto publicada permanece disponível na urna',requests.get(BASE+image).ok)
# Request validation and secret file exposure.
for path in ['/config/config.php','/storage/security/mfa.key','/database/001_initial.sql','/.git/config','/.env']:
 r=requests.get(BASE+path);check('Arquivo interno não servido: '+path,r.status_code==404)
r=owner.post(BASE+'/api/auth',data='{}',headers={**H,'Content-Type':'text/plain'});check('Tipo de conteúdo inválido recusado',r.status_code==415)
r=owner.post(BASE+'/api/auth',data='x'*5000,headers={**H,'Content-Type':'application/json'});check('Corpo excessivo de autenticação recusado',r.status_code==413)
r=owner.post(BASE+'/api/v2/app',json={'action':'election','value':{}},headers={**H,'Origin':'https://outro.example'});check('Origem externa não altera dados',r.status_code==403)
r=requests.post(BASE+'/api/auth',json={'action':'login','username':"' OR 1=1 --",'password':'incorreta'},headers=ORIGIN);check('Entrada SQL não contorna senha nem revela banco',r.status_code==401 and not any(x in r.text for x in ['SQLSTATE','PDOException','SELECT']))
r=owner.get(BASE+'/api/v2/audit?from=2026-02-31',headers=H);check('Filtro de data inválido recusado',r.status_code==400)
r=owner.get(BASE+'/api/v2/audit',headers=H);check('Histórico não contém senhas ou tokens',r.ok and not any(x in r.text for x in [password,'TesteV2Seguro!123','panelKey','gateHash']))
# Changing a password continues working without a second factor and revokes old sessions.
new='NovaFicticiaPrivacidade!42';old=staff.cookies.get_dict().copy();oldH=SH.copy()
r=staff.post(BASE+'/api/auth',json={'action':'password','currentPassword':password,'newPassword':new,'confirmPassword':new},headers=SH);assert r.ok,r.text
check('Troca de senha funciona sem segundo fator',bool(r.json()['panelKey']))
stale=requests.Session();stale.cookies.update(old);check('Troca de senha revoga sessão antiga',stale.get(BASE+'/api/v2/app',headers=oldH).status_code==401)
_,_,r=login(username,new);check('Nova senha abre sessão sem código adicional',not r.json().get('mfaRequired'))
print(f'Proteção de dados PHP: {passed} verificações aprovadas.')
