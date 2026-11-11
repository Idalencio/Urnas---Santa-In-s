"""Apuração agregada, permissões e resultado final em banco local descartável."""
import os, requests, uuid, datetime, json, time
BASE=os.environ['URNA_TEST_URL']; assert BASE.startswith('http://127.0.0.1:')
s=requests.Session(); h={'Origin':BASE}; passed=0
r=s.post(BASE+'/api/auth',json={'action':'login','username':'admin','password':'TesteV2Seguro!123'},headers=h); assert r.ok,r.text
h['X-Urna-Panel']=r.json()['panelKey']
def app(action,**v):
 r=s.post(BASE+'/api/v2/app',json={'action':action,**v},headers=h,timeout=20)
 assert r.ok,r.text
 return r.json()
def tally(eid,session=s,headers=h):return session.get(BASE+'/api/v2/tally',params={'election':eid},headers=headers,timeout=20)
def check(label,condition):
 global passed
 assert condition,label
 passed+=1; print('OK',label,flush=True)
def iso(seconds):return (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=seconds)).isoformat(timespec='milliseconds')
def setup(name,required=1):
 eid=app('election',value={'name':name,'digits':3,'hasVice':1,'requireMatricula':required})['id']
 for code in ['1','12','123']:app('candidate',value={'electionId':eid,'name':'Candidato '+code,'code':code,'image':'/characters/lion.svg','viceName':'Vice '+code,'viceImage':'/characters/owl.svg','active':1})
 return eid
def publish(eid,start=-60,end=3600):return app('publish',electionId=eid,models=['standard'],startsAt=iso(start),endsAt=iso(end))
def vote(eid,code,matricula=None):
 body={'action':'vote','electionId':eid,'code':code,'requestId':str(uuid.uuid4())}
 if matricula:
  r=requests.post(BASE+'/api/v2/urna/urna-padrao',json={'action':'authorize','electionId':eid,'matricula':matricula},headers={'Origin':BASE},timeout=20); assert r.ok,r.text; body['gate']=r.json()['gate']
 r=requests.post(BASE+'/api/v2/urna/urna-padrao',json=body,headers={'Origin':BASE},timeout=20); assert r.ok,r.text
 return body
app('csvImport',csv='nome;turma;matricula\nEleitor privado A;Apuração QA;TAL001\nEleitor privado B;Apuração QA;TAL002\n')
eid=setup('Apuração QA'); app('enroll',electionId=eid,classes=['Apuração QA'])
check('Rascunho sem apuração',tally(eid).status_code==409)
publish(eid)
check('Apuração exige login',tally(eid,requests.Session(),{}).status_code==401)
check('Apuração exige chave do painel',tally(eid,s,{}).status_code==401)
check('Método de escrita recusado',s.post(BASE+'/api/v2/tally',json={},headers=h).status_code==405)
r=tally(eid); d=r.json(); check('Apuração aberta e sem cache',r.ok and d['election']['status']=='active' and r.headers.get('Cache-Control')=='no-store')
check('Três candidatos e vices, inclusive sem votos',len(d['candidates'])==3 and all(c['votes']==0 and c['viceName'] and c['viceImage'] for c in d['candidates']))
check('Totais iniciais coerentes',d['totals']=={'votes':0,'eligible':2,'voted':0})
first=vote(eid,'1','TAL001'); d=tally(eid).json()
check('Novo voto aparece na consulta seguinte',d['totals']=={'votes':1,'eligible':2,'voted':1} and next(c for c in d['candidates'] if c['code']=='1')['votes']==1)
repeat=requests.post(BASE+'/api/v2/urna/urna-padrao',json=first,headers={'Origin':BASE}); assert repeat.ok
check('Reenvio idempotente não duplica apuração',tally(eid).json()['totals']['votes']==1)
vote(eid,'12','TAL002'); d=tally(eid).json()
check('Empate mantém votos de ambos',sorted(c['votes'] for c in d['candidates'])==[0,1,1] and d['totals']['voted']==2)
encoded=json.dumps(d); check('Sem identificação individual de eleitores',all(x not in encoded for x in ['TAL001','TAL002','Eleitor privado','matricula','gate','students','electors']))
check('Data de consulta informada',bool(datetime.datetime.fromisoformat(d['generatedAt'].replace('Z','+00:00'))))
second=setup('Apuração independente',0); publish(second); vote(second,'123')
check('Eleição separada, mesma urna',tally(second).json()['totals']['votes']==1 and tally(eid).json()['totals']['votes']==2)
account={'name':'Consulta apuração','username':'tally.qa','role':'staff','active':1,'permissions':[],'classes':[],'electionIds':[eid],'password':'SenhaApuracaoQA!42'}
aid=app('account',value=account)['id']; staff=requests.Session(); login=staff.post(BASE+'/api/auth',json={'action':'login','username':'tally.qa','password':'SenhaApuracaoQA!42'},headers={'Origin':BASE}); assert login.ok,login.text
sh={'X-Urna-Panel':login.json()['panelKey']}
check('Sem permissão de resultados é bloqueado',tally(eid,staff,sh).status_code==403)
app('account',value={**account,'id':aid,'password':'','permissions':['viewResults']})
check('Permissão não revela eleição alheia',tally(eid,staff,sh).status_code==403)
check('Permissão não libera eleição alheia',tally(second,staff,sh).status_code==403)
app('account',value={**account,'id':aid,'password':'','permissions':[]})
check('Revogação vale na consulta seguinte',tally(eid,staff,sh).status_code==403)
app('close',electionId=eid); final=tally(eid).json()
check('Encerrada mostra o resultado final',final['election']['status']=='closed' and final['totals']['votes']==2)
check('Consulta final não muda os votos',tally(eid).json()['candidates']==final['candidates'] and tally(eid).json()['totals']==final['totals'])
scheduled=setup('Apuração agendada',0); publish(scheduled,60,3600)
check('Eleição agendada sem votos',tally(scheduled).json()['election']['status']=='scheduled' and tally(scheduled).json()['totals']['votes']==0)
expired=setup('Apuração encerramento por horário',0); publish(expired,-60,1); time.sleep(1.25)
check('Encerramento pelo horário reconhecido',tally(expired).json()['election']['status']=='closed')
check('Eleição desconhecida recusada',tally(str(uuid.uuid4())).status_code==404)
print(f'Apuração PHP: {passed} verificações aprovadas.')
