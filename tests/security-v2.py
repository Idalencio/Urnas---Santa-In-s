"""MFA, sigilo e histórico: somente usuários e banco descartáveis do runner."""
import os,requests,uuid,time,base64,hmac,hashlib,struct,concurrent.futures,json
BASE=os.environ['URNA_TEST_URL'];assert BASE.startswith('http://127.0.0.1:')
ORIGIN={'Origin':BASE};passed=0

def check(name,condition):
 global passed
 assert condition,name
 passed+=1;print('OK',name,flush=True)
def login(username,password,code=None,session=None):
 session=session or requests.Session();r=session.post(BASE+'/api/auth',json={'action':'login','username':username,'password':password,**({'code':code} if code else {})},headers=ORIGIN,timeout=20)
 return session,r
def code(secret,step=None):
 step=step if step is not None else int(time.time())//30
 mac=hmac.new(base64.b32decode(secret),struct.pack('>Q',step),hashlib.sha1).digest();offset=mac[-1]&15
 return str((struct.unpack('>I',mac[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)
owner,r=login('admin','TesteV2Seguro!123');assert r.ok,r.text
H={**ORIGIN,'X-Urna-Panel':r.json()['panelKey']}
def app(action,**payload):
 r=owner.post(BASE+'/api/v2/app',json={'action':action,**payload},headers=H,timeout=20);assert r.ok,r.text;return r.json()
def auth(s,h,action,**payload):return s.post(BASE+'/api/auth',json={'action':action,**payload},headers={**ORIGIN,**h},timeout=20)
# A separate test administrator avoids changing the owner's real settings.
username='sec.'+uuid.uuid4().hex[:8];password='FicticiaSeguranca!42'
aid=app('account',value={'name':'Segurança QA','username':username,'password':password,'role':'admin','active':1,'permissions':[],'classes':[],'electionIds':[]})['id']
s,r=login(username,password);assert r.ok,r.text;sh={'X-Urna-Panel':r.json()['panelKey']};old_cookie=s.cookies.get_dict().copy();old_panel=sh.copy()
check('Status de MFA sem dados secretos',auth(s,sh,'mfaStatus').json()=={'enabled':False,'remaining':0})
check('Configuração exige a senha atual',auth(s,sh,'mfaBegin',currentPassword='Errada').status_code==401)
r=auth(s,sh,'mfaBegin',currentPassword=password);assert r.ok,r.text;secret=r.json()['secret'];check('Chave aleatória base32 e URI local',len(base64.b32decode(secret))==20 and r.json()['uri'].startswith('otpauth://totp/'))
# Enrollment cannot be confirmed by another signed-in tab/session.
other,rr=login(username,password);oh={'X-Urna-Panel':rr.json()['panelKey']}
check('Configuração vinculada à aba do painel',auth(other,oh,'mfaConfirm',currentPassword=password,code=code(secret)).status_code==409)
check('Código incorreto não ativa MFA',auth(s,sh,'mfaConfirm',currentPassword=password,code='wrong').status_code==401)
# A previous accepted window allows a different current step for replay/concurrency tests.
r=auth(s,sh,'mfaConfirm',currentPassword=password,code=code(secret,int(time.time())//30-1));assert r.ok,r.text
codes=r.json()['codes'];sh={'X-Urna-Panel':r.json()['panelKey']}
check('Ativação emite dez códigos e renova sessão',len(codes)==10 and r.json()['enabled'] and sh!=old_panel)
check('Ativação encerra as outras sessões',other.get(BASE+'/api/v2/app',headers=oh).status_code==401)
old=requests.Session();old.cookies.update(old_cookie)
check('Token antigo também é revogado',old.get(BASE+'/api/v2/app',headers=old_panel).status_code==401)
fresh,rr=login(username,password)
check('Senha isolada não abre sessão com MFA',rr.ok and rr.json().get('mfaRequired') and 'panelKey' not in rr.json() and not rr.headers.get('set-cookie'))
check('API continua bloqueada após senha isolada',fresh.get(BASE+'/api/v2/app').status_code==401)
_,rr=login(username,password,'bad-code');check('Segundo fator inválido recusado',rr.status_code==401)
current=code(secret)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda _:login(username,password,current)[1],range(2)))
check('TOTP simultâneo só pode ser consumido uma vez',sorted(r.status_code for r in results)==[200,401])
_,rr=login(username,password,current);check('Reutilização do TOTP recusada',rr.status_code==401)
recovered,rr=login(username,password,codes[0]);assert rr.ok,rr.text;rh={'X-Urna-Panel':rr.json()['panelKey']}
check('Código de recuperação libera acesso',bool(rr.json().get('panelKey')))
_,rr=login(username,password,codes[0]);check('Código de recuperação funciona uma vez',rr.status_code==401)
check('Contagem de recuperação atualizada',auth(recovered,rh,'mfaStatus').json()['remaining']==9)
# Protect password changes with the active second factor too.
r=auth(recovered,rh,'password',currentPassword=password,newPassword='NovaFicticiaSeguro!42',confirmPassword='NovaFicticiaSeguro!42');check('Troca de senha exige segundo fator',r.status_code==401)
r=auth(recovered,rh,'mfaRecovery',currentPassword=password,code=codes[1]);assert r.ok,r.text;new_codes=r.json()['codes'];rh={'X-Urna-Panel':r.json()['panelKey']}
check('Renovação substitui todos os códigos',len(new_codes)==10 and not set(codes)&set(new_codes))
_,rr=login(username,password,codes[2]);check('Recuperações antigas são revogadas',rr.status_code==401)
r=auth(recovered,rh,'mfaDisable',currentPassword=password,code=new_codes[0]);assert r.ok,r.text;rh={'X-Urna-Panel':r.json()['panelKey']}
check('Desativação exige prova e elimina recuperação',not r.json()['enabled'] and r.json()['remaining']==0)
# History including unchanged imports, deletions and sensitive redaction.
eid=app('election',value={'name':'Histórico QA','digits':2,'hasVice':0,'requireMatricula':0})['id']
app('csvImport',csv='nome;turma;matricula\nRegistro QA;Segurança;SEC001\n');app('csvImport',csv='nome;turma;matricula\nRegistro QA;Segurança;SEC001\n')
app('deleteElection',electionId=eid)
r=owner.get(BASE+'/api/v2/audit',params={'election':eid},headers=H);assert r.ok,r.text;rows=r.json()['rows']
check('Histórico preserva eleição salva e excluída',{'election','deleteElection'}.issubset({r['action'] for r in rows}))
check('Histórico identifica alvo gerado',any(r['targetId']==eid for r in rows))
r=owner.get(BASE+'/api/v2/audit',params={'action':'csvImport'},headers=H);check('Importação sem mudança também auditada',r.ok and r.json()['total']>=2 and all('summary' in row['details'] for row in r.json()['rows']))
r=owner.get(BASE+'/api/v2/audit',params={'actor':aid},headers=H);assert r.ok,r.text;data=r.json();actions={x['action'] for x in data['rows']}
check('Ativação, recuperação e desativação auditadas',{'mfaConfirm','mfaRecovery','mfaDisable','login'}.issubset(actions))
raw=json.dumps(data);check('Histórico omite senha, seed e códigos',all(x not in raw for x in [password,secret,*codes,*new_codes,'panelKey','candidateId','gateHash']))
check('Histórico exige login',requests.get(BASE+'/api/v2/audit').status_code==401)
check('Histórico exige chave da aba',owner.get(BASE+'/api/v2/audit').status_code==401)
check('Histórico não permite escrita',owner.post(BASE+'/api/v2/audit',json={},headers=H).status_code==405)
check('Filtro de data inválido recusado',owner.get(BASE+'/api/v2/audit?from=2026-02-31',headers=H).status_code==400)
# A low-permission account must not see administrative history.
name='audit.'+uuid.uuid4().hex[:8];app('account',value={'name':'Sem histórico','username':name,'password':'FicticiaStaff!42','role':'staff','active':1,'permissions':[],'classes':[],'electionIds':[]})
st,rr=login(name,'FicticiaStaff!42');hh={'X-Urna-Panel':rr.json()['panelKey']}
check('Equipe não acessa histórico administrativo',st.get(BASE+'/api/v2/audit',headers=hh).status_code==403)
print(f'Segurança PHP: {passed} verificações aprovadas.')
