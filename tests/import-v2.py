"""Comparação CSV por matrícula no banco local descartável do runner."""
import os,requests,concurrent.futures
BASE=os.environ['URNA_TEST_URL'];assert BASE.startswith('http://127.0.0.1:')
s=requests.Session();h={'Origin':BASE};passed=0
r=s.post(BASE+'/api/auth',json={'action':'login','username':'admin','password':'TesteV2Seguro!123'},headers=h);assert r.ok,r.text
h['X-Urna-Panel']=r.json()['panelKey']
def app(action=None,**v):return s.post(BASE+'/api/v2/app',json={'action':action,**v},headers=h,timeout=20) if action else s.get(BASE+'/api/v2/app',headers=h,timeout=20)
def check(label,condition):
 global passed
 assert condition,label
 passed+=1;print('OK',label,flush=True)
def csv(rows):return 'nome;turma;matricula\n'+'\n'.join(';'.join(row) for row in rows)+'\n'
def roster():return app().json()['students']
initial=app().json();seed=next(e for e in initial['elections'] if e['published'])
old_rows=app('electors',electionId=seed['id']).json()['rows'];old_count=len(initial['students'])
f=csv([['Original','Import A','IM001'],['Igual','Import A','IM002'],['Inativo','Import A','IM003']])
r=app('csvImport',csv=f);check('Primeira importação informa novos',r.ok and r.json()['summary']['added']==3)
assert app('deleteStudent',matricula='IM003',className='Import A').ok
f=csv([['Corrigido','Import B','IM001'],['Igual','Import A','IM002'],['Reativado','Import B','IM003'],['Novo','Import B','IM004']])
before=roster();expected={'added':1,'updated':1,'unchanged':1,'reactivated':1}
r=app('csvPreview',csv=f);check('Prévia compara quatro situações',r.ok and r.json()['summary']==expected)
check('Prévia informa ação por matrícula',[row['change'] for row in r.json()['rows']]==['updated','unchanged','reactivated','added'])
check('Prévia não grava',before==roster())
r=app('csvImport',csv=f);check('Gravação informa resultado real',r.ok and r.json()['summary']==expected)
after=roster();check('Uma linha por matrícula',len(after)==old_count+4 and len({a['matricula'] for a in after})==len(after))
row=next(a for a in after if a['matricula']=='IM001');check('Atualiza nome e turma do mesmo aluno',row['name']=='Corrigido' and row['className']=='Import B')
check('Reativa sem duplicar',sum(a['matricula']=='IM003' for a in after)==1)
r=app('csvImport',csv=f);check('Arquivo repetido é idempotente',r.ok and r.json()['summary']=={'added':0,'updated':0,'unchanged':4,'reactivated':0})
check('Nomes iguais com outra matrícula são distintos',app('csvImport',csv=csv([['Novo','Import B','IM005']])).json()['summary']['added']==1)
stable=roster();invalid=csv([['Primeiro','Import A','IM004'],['Repetido','Import B',' IM004 ']])
check('Duplicidade no arquivo bloqueada',app('csvPreview',csv=invalid).status_code==400 and app('csvImport',csv=invalid).status_code==400)
check('Falha não altera dados',roster()==stable)
assert app('csvImport',csv=csv([['Zeros','Import A','00101'],['Sem zeros','Import A','101']])).ok
check('Matrículas preservam zeros',{'00101','101'}<={row['matricula'] for row in roster()})
app('csvPreview',csv=csv([['Novo','Import B','IM004']]))
assert app('student',value={'originalMatricula':'IM004','matricula':'IM004','name':'Mudou depois da prévia','className':'Import B'}).ok
r=app('csvImport',csv=csv([['Novo','Import B','IM004']]));check('Confirmação refaz comparação',r.ok and r.json()['summary']['updated']==1)
check('Ausentes preservados',any(row['matricula']=='IM005' for row in roster()))
assert app('renameClass',**{'from':'Import A','name':'Import C'}).ok
r=app('csvPreview',csv=csv([['Igual','Import A','IM002']]));check('Turma histórica normalizada',r.ok and r.json()['rows'][0]['className']=='Import C' and r.json()['summary']['unchanged']==1)
shared=csv([['Concorrente','Import C','IMCONC']]);cookies=s.cookies.get_dict()
def concurrent_import():return requests.post(BASE+'/api/v2/app',json={'action':'csvImport','csv':shared},headers=h,cookies=cookies,timeout=20)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:both=list(pool.map(lambda _:concurrent_import(),range(2)))
check('Importação concorrente recalcula',all(r.ok for r in both) and sum(r.json()['summary']['added'] for r in both)==1 and sum(r.json()['summary']['unchanged'] for r in both)==1)
check('Importação concorrente não duplica',sum(row['matricula']=='IMCONC' for row in roster())==1)
check('Eleitorado publicado preservado',app('electors',electionId=seed['id']).json()['rows']==old_rows)
print(f'Importação PHP: {passed} verificações aprovadas.')
