"""Exclusivo de cópia local com banco descartável. Requer requests.
URNA_TEST_URL=http://127.0.0.1:8096 python3 tests/integration-v2.py
O banco precisa ser preparado pelo ambiente de teste. Nunca use no servidor da escola.
"""
import os,requests,uuid,datetime,concurrent.futures,json
BASE=os.environ['URNA_TEST_URL'];assert BASE.startswith('http://127.0.0.1:')
s=requests.Session();H={'Origin':BASE};checks=[]
def check(name,condition):
 assert condition,name
 checks.append(name);print('OK',name,flush=True)
def req(path,body,session=s,headers=None):return session.post(BASE+path,json=body,headers={**H,**(headers or {})},timeout=30)
def app(action,**payload):return req('/api/v2/app',{'action':action,**payload},headers={'X-Urna-Panel':key})
def state():
 r=s.get(BASE+'/api/v2/app',headers={'X-Urna-Panel':key},timeout=30);assert r.ok,r.text;return r.json()
def public(t,eid=None):return requests.get(BASE+'/api/v2/urna/'+t,params={'election':eid} if eid else {},timeout=10).json()
def pub(t,b):return req('/api/v2/urna/'+t,b,session=requests.Session())
def iso(offset):return (datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=offset)).isoformat(timespec='milliseconds')
check('V2 HTML acessível',requests.get(BASE+'/v2').status_code==200)
check('Painel V2 protegido',requests.get(BASE+'/api/v2/app').status_code==401)
check('Origem estrangeira rejeitada',s.post(BASE+'/api/v2/app',json={},headers={'Origin':'https://outro.example'}).status_code==403)
r=req('/api/auth',{'action':'login','username':'admin','password':'TesteV2Seguro!123'})
check('Login administrativo existente preservado',r.ok);key=r.json()['panelKey']
d=state();check('Migração V2 sem candidaturas de exemplo',not d['elections'] and len(d['terminals'])==2)
r=s.get(BASE+'/api/app',headers={'X-Urna-Panel':key});check('Votação antiga preservada após migração',r.ok and len(r.json()['elections'])==1 and sum(x['total'] for x in r.json()['elections'][0]['results'])==1)
csv='nome;turma;matricula\nAna de Teste;6A;001234\nBruno de Teste;6B;1234\nCarla de Teste;6A;0005\n'
r=app('csvPreview',csv=csv);check('Prévia CSV preserva zeros das matrículas',r.ok and r.json()['rows'][0]['matricula']=='001234')
check('CSV rejeita matrículas duplicadas',app('csvPreview',csv=csv+'Ana repetida;6A;001234\n').status_code==400)
check('CSV rejeita colunas ausentes',app('csvPreview',csv='nome;matricula\nAna;001\n').status_code==400)
check('CSV importado atomicamente',app('csvImport',csv=csv).ok and len(state()['students'])==3)
check('Reimportação atualiza sem duplicar',app('csvImport',csv=csv).ok and len(state()['students'])==3)
eids=[]
for name,vice in [('Prefeito 6A',1),('Representantes',0)]:
 r=app('election',value={'name':name,'digits':3,'hasVice':vice,'requireMatricula':1});assert r.ok,r.text;eids.append(r.json()['id'])
e1,e2=eids;check('Eleições independentes criadas',e1!=e2)
png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
r=app('image',imageData='data:image/png;base64,'+png);assert r.ok,r.text;image=r.json()['image']
check('Imagem ainda não publicada fica restrita',requests.get(BASE+image).status_code==403)
v={'electionId':e1,'name':'Prefeita A','code':'1','image':'/characters/lion.svg','viceName':'Vice A','viceImage':image,'active':1}
check('Chapa com número 1 e vice cadastrada',app('candidate',value=v).ok)
check('Chapa com número 12 na mesma eleição',app('candidate',value={**v,'name':'Prefeito B','code':'12','viceName':'Vice B','viceImage':'/characters/owl.svg'}).ok)
for code in ['23','34','45','56']:
 check('Chapa prefeito e vice número '+code,app('candidate',value={**v,'name':'Prefeito '+code,'code':code,'viceName':'Vice '+code,'viceImage':'/characters/owl.svg'}).ok)
check('Seis chapas completas cadastradas',len(next(e for e in state()['elections'] if e['id']==e1)['candidates'])==6)
check('Número 1 pode repetir em outra eleição',app('candidate',value={**v,'electionId':e2,'name':'Candidato de outra eleição','viceName':'','viceImage':''}).ok)
check('Número repetido na mesma eleição bloqueado',app('candidate',value=v).status_code==400)
check('Zero à esquerda não é acrescentado nem aceito',app('candidate',value={**v,'code':'01'}).status_code==400)
check('Vice obrigatório na eleição com chapa',app('candidate',value={**v,'code':'2','viceName':''}).status_code==400)
check('Limite de dígitos validado no servidor',app('candidate',value={**v,'code':'1234'}).status_code==400)
check('Eleitores por turma associados à primeira eleição',app('enroll',electionId=e1,classes=['6A']).ok)
check('Eleitores da segunda eleição associados separadamente',app('enroll',electionId=e2,classes=[]).ok)
for id,model in [('urna-padrao','standard'),('urna-infantil','images')]:
 assert app('terminal',value={'id':id,'name':id,'location':'Teste','model':model,'electionId':e1}).ok
check('Duas urnas vinculadas à mesma eleição',sum(t['electionId']==e1 for t in state()['terminals'])==2)
r=app('terminal',value={'name':'Biblioteca','location':'Teste','model':'standard','electionId':e2});assert r.ok
t3=next(t['id'] for t in state()['terminals'] if t['name']=='Biblioteca')
check('Publicação da primeira eleição',app('publish',electionId=e1,startsAt=iso(-60),endsAt=iso(3600)).ok)
check('Publicação da segunda eleição',app('publish',electionId=e2,startsAt=iso(-60),endsAt=iso(3600)).ok)
check('Foto do vice publicada acessível sem login',requests.get(BASE+image).status_code==200)
d=public('urna-padrao');check('Urna pública mostra seis chapas sem prefixo automático',sorted(c['code'] for c in d['election']['candidateSnapshot'])==['1','12','23','34','45','56'])
check('Seis prefeitos e vices com nomes e fotos na urna',all(c['name'] and c['image'] and c['viceName'] and c['viceImage'] for c in d['election']['candidateSnapshot']))
check('Dados de alunos ausentes na API pública','students' not in d and 'electors' not in d)
check('Configuração publicada não muda',app('election',value={'id':e1,'name':'Alteração','digits':3,'hasVice':1,'requireMatricula':1}).status_code==409)
check('Eleitores publicados não mudam',app('enroll',electionId=e1,classes=[]).status_code==409)
check('Urna ativa não troca de eleição',app('terminal',value={'id':'urna-padrao','name':'Urna','model':'standard','electionId':e2}).status_code==400)
def authorize(t,m):return pub(t,{'action':'authorize','matricula':m})
check('Matrícula desconhecida bloqueada',authorize('urna-padrao','999999').status_code==403)
check('Aluno de outra turma bloqueado nesta eleição',authorize('urna-padrao','1234').status_code==403)
r=authorize('urna-padrao','001234');check('Matrícula com zeros libera a urna',r.ok);gate=r.json()['gate']
check('Mesma matrícula não recebe duas liberações simultâneas',authorize('urna-infantil','001234').status_code==409)
vote={'requestId':str(uuid.uuid4()),'electionId':e1,'code':'1'}
check('Voto sem liberação bloqueado',pub('urna-padrao',vote).status_code==403)
check('Liberação vinculada à urna correta',pub('urna-infantil',{**vote,'gate':gate}).status_code==403)
check('Número não cadastrado bloqueado',pub('urna-padrao',{**vote,'code':'2','gate':gate}).status_code==400)
check('Primeiro voto autenticado aceito',pub('urna-padrao',{**vote,'gate':gate}).ok)
check('Reenvio da mesma confirmação idempotente',pub('urna-padrao',{**vote,'gate':gate}).json().get('duplicate') is True)
check('Confirmação não pode trocar de candidato',pub('urna-padrao',{**vote,'code':'12','gate':gate}).status_code==409)
check('Matrícula que votou é bloqueada em outra urna da mesma eleição',authorize('urna-infantil','001234').status_code==409)
r=authorize('urna-infantil','0005');assert r.ok;gate2=r.json()['gate']
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as p:
 responses=list(p.map(lambda _:pub('urna-infantil',{'requestId':str(uuid.uuid4()),'electionId':e1,'code':'12','gate':gate2}),range(12)))
check('12 confirmações concorrentes da matrícula geram um voto',sum(r.ok for r in responses)==1 and all(r.status_code in (200,403) for r in responses))
r=authorize(t3,'001234');check('Mesmo aluno pode votar em outra eleição',r.ok)
check('Voto na segunda eleição aceito',pub(t3,{'requestId':str(uuid.uuid4()),'electionId':e2,'code':'1','gate':r.json()['gate']}).ok)
d=state();a=next(e for e in d['elections'] if e['id']==e1);b=next(e for e in d['elections'] if e['id']==e2)
check('Apuração independente por eleição',sum(x['total'] for x in a['results'])==2 and sum(x['total'] for x in b['results'])==1)
check('Participação acompanha matrículas sem expor candidato','candidateId' not in app('electors',electionId=e1).json()['rows'][0])
check('Participação registrada uma vez por aluno',a['votedCount']==2 and b['votedCount']==1)
check('Encerramento de eleição',app('close',electionId=e1).ok)
check('Eleição encerrada recusa novas liberações',authorize('urna-padrao','001234').status_code==409)
check('Reenvio válido após encerrar permanece idempotente',pub('urna-padrao',{**vote,'gate':gate}).json().get('duplicate') is True)
check('Mesma urna pode receber outra eleição após encerrar',app('terminal',value={'id':'urna-padrao','name':'Urna padrão','model':'standard','electionId':e2}).ok)
check('Trocar de urna não contorna limite de voto por eleição',authorize('urna-padrao','001234').status_code==409)
r=authorize('urna-padrao','0005');assert r.ok
check('Liberação pode ser cancelada antes do voto',pub('urna-padrao',{'action':'cancel','gate':r.json()['gate']}).ok)
check('Aluno pode se identificar novamente após cancelar',authorize('urna-padrao','0005').ok)
r=app('duplicate',electionId=e1);assert r.ok;copy=next(e for e in state()['elections'] if e['id']==r.json()['id'])
check('Duplicação copia candidatos sem votos nem participação',len(copy['candidates'])==6 and copy['published']==0 and copy['votedCount']==0 and not copy['results'])
old=s.get(BASE+'/api/app',headers={'X-Urna-Panel':key}).json()
check('Dados anteriores preservados ao fim dos testes',sum(x['total'] for x in old['elections'][0]['results'])==1)
# Fluxo simplificado: escolher modelos deve publicar mesmo com as urnas antigas ocupadas.
before=state();old_links={t['id']:t['electionId'] for t in before['terminals']}
check('Eleitores preparados para publicação guiada',app('enroll',electionId=copy['id'],classes=['6A']).ok)
check('Nenhum modelo selecionado é recusado',app('publish',electionId=copy['id'],models=[],startsAt=iso(-60),endsAt=iso(3600)).status_code==400)
check('Modelo desconhecido é recusado',app('publish',electionId=copy['id'],models=['outro'],startsAt=iso(-60),endsAt=iso(3600)).status_code==400)
check('Modelo malformado é recusado',app('publish',electionId=copy['id'],models=[{}],startsAt=iso(-60),endsAt=iso(3600)).status_code==400)
check('Falha de validação não cria urnas',len(state()['terminals'])==len(before['terminals']))
check('Publicar escolhendo teclado e imagens sem vínculo manual',app('publish',electionId=copy['id'],models=['standard','images'],startsAt=iso(-60),endsAt=iso(3600)).ok)
after=state();new_e=next(e for e in after['elections'] if e['id']==copy['id']);new_terms=[t for t in after['terminals'] if t['id'] in new_e['terminalIds']]
check('Mesmas urnas disponíveis para os dois modelos selecionados',len(new_terms)==2 and {t['model'] for t in new_terms}=={'standard','images'})
check('Urnas já ocupadas continuam na eleição anterior',all(next(t for t in after['terminals'] if t['id']==tid)['electionId']==eid for tid,eid in old_links.items()))
check('Mesma urna abre a eleição selecionada',all(public(t['id'],copy['id'])['election']['id']==copy['id'] for t in new_terms))
check('Publicação repetida não cria links duplicados',app('publish',electionId=copy['id'],models=['standard'],startsAt=iso(-60),endsAt=iso(3600)).status_code==409 and len(state()['terminals'])==len(after['terminals']))
r=app('election',value={'name':'Fotos faltando QA','digits':5,'hasVice':1,'requireMatricula':1});assert r.ok;missing_id=r.json()['id']
assert app('candidate',value={'electionId':missing_id,'name':'Prefeito QA','code':'777','image':'','viceName':'Vice QA','viceImage':'','active':1}).ok
assert app('enroll',electionId=missing_id,classes=[]).ok
n=len(state()['terminals']);r=app('publish',electionId=missing_id,models=['images'],startsAt=iso(-60),endsAt=iso(3600))
check('Foto ausente informa a chapa que precisa corrigir',r.status_code==400 and '777' in r.json()['error'])
check('Falha por foto não deixa publicação parcial',len(state()['terminals'])==n and not next(e for e in state()['elections'] if e['id']==missing_id)['published'])
check('Escolha somente teclado compartilha somente a urna padrão',app('publish',electionId=missing_id,models=['standard'],startsAt=iso(-60),endsAt=iso(3600)).ok and next(e for e in state()['elections'] if e['id']==missing_id)['terminalIds']==['urna-padrao'])
check('Publicar várias eleições não cria urnas extras',len(state()['terminals'])==len(before['terminals']))
choices=public('urna-padrao');check('Urna compartilhada oferece escolha entre eleições',choices['election'] is None and copy['id'] in [x['id'] for x in choices['elections']] and missing_id in [x['id'] for x in choices['elections']])
check('Múltiplas eleições exigem escolha antes da matrícula',authorize('urna-padrao','001234').status_code==400)
r=pub('urna-padrao',{'action':'authorize','electionId':copy['id'],'matricula':'001234'});check('Matrícula libera primeira eleição na urna compartilhada',r.ok);shared_a=r.json()['gate']
r=pub('urna-padrao',{'action':'authorize','electionId':missing_id,'matricula':'001234'});check('Mesmo aluno libera segunda eleição na mesma urna',r.ok);shared_b=r.json()['gate']
check('Liberação de outra eleição não serve para votar nesta',pub('urna-padrao',{'requestId':str(uuid.uuid4()),'electionId':copy['id'],'code':'1','gate':shared_b}).status_code==403)
check('Voto na primeira eleição compartilhada',pub('urna-padrao',{'requestId':str(uuid.uuid4()),'electionId':copy['id'],'code':'1','gate':shared_a}).ok)
check('Voto na segunda eleição compartilhada',pub('urna-padrao',{'requestId':str(uuid.uuid4()),'electionId':missing_id,'code':'777','gate':shared_b}).ok)
check('Não pode repetir o voto na primeira eleição compartilhada',pub('urna-padrao',{'action':'authorize','electionId':copy['id'],'matricula':'001234'}).status_code==409)
check('Escolha de eleição de outra urna é recusada',requests.get(BASE+'/api/v2/urna/'+t3,params={'election':copy['id']}).status_code==409)
assert app('close',electionId=copy['id']).ok
check('Encerrar uma eleição mantém a outra aberta na mesma urna',missing_id in [x['id'] for x in public('urna-padrao')['elections']] and copy['id'] not in [x['id'] for x in public('urna-padrao')['elections']])
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2),flush=True)
