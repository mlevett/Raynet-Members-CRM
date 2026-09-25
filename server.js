const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const tls = require('tls');

const root = __dirname;
const dataDir = process.env.RAYNET_DATA_DIR ? path.resolve(process.env.RAYNET_DATA_DIR) : path.join(root, 'data');
const usersFile = path.join(dataDir, 'users.json');
const brandingFile = path.join(dataDir, 'branding.json');
const settingsFile = path.join(dataDir, 'settings.json');
const membersFile = path.join(dataDir, 'members.json');
const responsesFile = path.join(dataDir, 'event-responses.json');
const organisationsFile = path.join(dataDir, 'organisations.json');
const renewalsFile = path.join(dataDir, 'renewals.json');
const emailSettingsFile = path.join(dataDir, 'email-settings.json');
const renewalAutomationFile = path.join(dataDir, 'renewal-automation.json');
const publicSiteFile = path.join(dataDir, 'public-site.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
const guestHelpersFile = path.join(dataDir, 'guest-helpers.json');
const eventsFile = path.join(dataDir, 'events.json');
const storageConfigFile = path.join(dataDir, 'storage-config.json');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const appUrl = new URL(process.env.APP_URL || `http://localhost:${port}`);
const trustedOrigins = new Set([appUrl.origin,`http://localhost:${port}`,`http://127.0.0.1:${port}`,...String(process.env.TRUSTED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean)]);
const trustProxy = process.env.TRUST_PROXY === '1';
let savedStorageConfig={};try{savedStorageConfig=JSON.parse(fs.readFileSync(storageConfigFile,'utf8'))}catch{}
let storageDriver = String(process.env.STORAGE_DRIVER||savedStorageConfig.driver||'json').toLowerCase();
let mysqlPool = null;
let mysqlWriteQueue = Promise.resolve();
const mysqlMemory = new Map();
function jsonCacheEnabled(){return storageDriver!=='mysql'||savedStorageConfig.keepJsonCache!==false}
const loginAttempts = new Map();
const guestInterestAttempts = new Map();
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json' };

fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]\n');
const defaultBranding = { name:'South East Hampshire RAYNET', shortName:'SE Hants RAYNET', subtitle:'Member CRM', primary:'#07175e', accent:'#e0001b', logo:'/assets/sehants-raynet-logo.png' };
if (!fs.existsSync(brandingFile)) fs.writeFileSync(brandingFile, JSON.stringify(defaultBranding,null,2)+'\n');
const defaultSettings={committeePositions:['Group Controller','Deputy Group Controller','Group Secretary','Membership Officer','Treasurer']};
defaultSettings.renewalTermYears=3;
if(!fs.existsSync(settingsFile))fs.writeFileSync(settingsFile,JSON.stringify(defaultSettings,null,2)+'\n');
if(!fs.existsSync(membersFile))fs.writeFileSync(membersFile,'[]\n');
if(!fs.existsSync(responsesFile))fs.writeFileSync(responsesFile,'[]\n');
if(!fs.existsSync(organisationsFile))fs.writeFileSync(organisationsFile,'[]\n');
if(!fs.existsSync(renewalsFile))fs.writeFileSync(renewalsFile,'[]\n');
if(!fs.existsSync(emailSettingsFile))fs.writeFileSync(emailSettingsFile,JSON.stringify({host:'',port:587,security:'starttls',username:'',password:'',fromName:'',fromEmail:'',replyTo:''},null,2)+'\n');
const defaultRenewalAutomation={enabled:false,chaseAfterDays:14,finalAfterDays:14,lapseAfterDays:14,initialSubject:'Your {{organisation}} membership renewal',initialBody:'Hello {{name}},\n\nYour membership is due for renewal until {{expiry}}. Please respond using your personal link:\n{{link}}',chaseSubject:'Reminder: your membership renewal',chaseBody:'Hello {{name}},\n\nWe have not yet received your renewal response. Please reply here:\n{{link}}',finalSubject:'Final reminder: membership renewal',finalBody:'Hello {{name}},\n\nThis is your final renewal reminder. If we do not hear from you, your membership will be marked as lapsed.\n{{link}}'};
if(!fs.existsSync(renewalAutomationFile))fs.writeFileSync(renewalAutomationFile,JSON.stringify(defaultRenewalAutomation,null,2)+'\n');
const defaultPublicSite={heroTitle:'Your South East Hampshire RAYNET member hub.',heroText:'See group news and upcoming events, access useful member resources, and sign in to manage your profile and availability.',links:[{title:'Main SE Hants RAYNET website',url:'https://www.sehantsraynet.org.uk/',description:'Visit our main public website for information about the group, coverage, contacts and how we help.'},{title:'RAYNET UK',url:'https://www.raynet-uk.net/',description:'Visit the national RAYNET organisation.'}],news:[{title:'Welcome to the member hub',date:'2026-09-24',summary:'This members site brings upcoming events, group updates and secure member access together in one place.'}]};
const sampleMembers=[
  {name:'Example Member',call:'M7ABC',membershipNumber:'SAMPLE-001',raynetEmail:'member@example.invalid',personalEmail:'',mobilePhone:'07700 900000',homePhone:'',address:'',membershipType:'Member',committeePositions:[],status:'Active',renewal:'31 Mar 2029'},
  {name:'Example Committee Member',call:'G0ABC',membershipNumber:'SAMPLE-002',raynetEmail:'committee@example.invalid',personalEmail:'',mobilePhone:'07700 900001',homePhone:'',address:'',membershipType:'Committee member',committeePositions:['Group Secretary','Membership Officer'],status:'Active',renewal:'31 Mar 2029'}
];
const sampleOrganisations=[
  {name:'Example Local Authority',type:'Local authority',desc:'Sample resilience partner for demonstration purposes.',contacts:[],last:'Never',initials:'EL'},
  {name:'Example Charity',type:'Charity',desc:'Sample voluntary-sector partner for demonstration purposes.',contacts:[],last:'Never',initials:'EC'}
];
const sampleEvents=[
  {id:'sample-event-1',title:'Example Training Exercise',date:'18 Oct',fullDate:'2026-10-18',time:'09:30',location:'Example venue',desc:'Sample event for testing member availability.',yes:0,needed:8,tone:'',sample:true},
  {id:'sample-event-2',title:'Example Community Event',date:'08 Nov',fullDate:'2026-11-08',time:'10:00',location:'Example town centre',desc:'Sample public-service event.',yes:0,needed:6,tone:'amber',sample:true}
];
if(!fs.existsSync(publicSiteFile))fs.writeFileSync(publicSiteFile,JSON.stringify(defaultPublicSite,null,2)+'\n');
if(!fs.existsSync(sessionsFile))fs.writeFileSync(sessionsFile,'[]\n');
if(!fs.existsSync(guestHelpersFile))fs.writeFileSync(guestHelpersFile,'[]\n');
if(!fs.existsSync(eventsFile))fs.writeFileSync(eventsFile,'[]\n');

function storedText(file){const collection=path.basename(file,'.json');if(storageDriver==='mysql'&&mysqlMemory.has(collection))return mysqlMemory.get(collection);return fs.readFileSync(file,'utf8')}
function readUsers() { try { return JSON.parse(storedText(usersFile)); } catch { return []; } }
function persistFile(file,value){const content=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',collection=path.basename(file,'.json');if(mysqlPool&&!jsonCacheEnabled())mysqlMemory.set(collection,content);else{const temp=file+'.tmp';fs.writeFileSync(temp,content);fs.renameSync(temp,file)}if(mysqlPool){mysqlMemory.set(collection,content);mysqlWriteQueue=mysqlWriteQueue.then(()=>mysqlPool.execute('INSERT INTO raynet_crm_store (collection_name,payload) VALUES (?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload), updated_at=CURRENT_TIMESTAMP',[collection,content])).catch(error=>console.error('MySQL write failed:',error.message))}}
function writeUsers(users) { persistFile(usersFile,users); }
function readBranding(){try{return {...defaultBranding,...JSON.parse(storedText(brandingFile))};}catch{return defaultBranding;}}
function writeBranding(branding){persistFile(brandingFile,branding);}
function readSettings(){try{return {...defaultSettings,...JSON.parse(storedText(settingsFile))};}catch{return defaultSettings;}}
function writeSettings(settings){persistFile(settingsFile,settings);}
function readCollection(file){try{return JSON.parse(storedText(file));}catch{return [];}}
function writeCollection(file,items){persistFile(file,items);}
const storageFiles=[usersFile,brandingFile,settingsFile,membersFile,responsesFile,organisationsFile,renewalsFile,emailSettingsFile,renewalAutomationFile,publicSiteFile,sessionsFile,guestHelpersFile,eventsFile];
function mysqlConfigFrom(source={}){return {driver:'mysql',host:String(process.env.MYSQL_HOST||source.host||'').trim(),port:Number(process.env.MYSQL_PORT||source.port||3306),database:String(process.env.MYSQL_DATABASE||source.database||'').trim(),user:String(process.env.MYSQL_USER||source.user||'').trim(),password:String(process.env.MYSQL_PASSWORD!==undefined?process.env.MYSQL_PASSWORD:source.password||''),ssl:String(process.env.MYSQL_SSL!==undefined?process.env.MYSQL_SSL:source.ssl?'1':'0')==='1',keepJsonCache:source.keepJsonCache!==false}}
function validateMysqlConfig(config){if(!config.host||!config.database||!config.user)throw new Error('MySQL host, database and user are required.');if(!Number.isInteger(config.port)||config.port<1||config.port>65535)throw new Error('Enter a valid MySQL port.');return config}
function mysqlClient(){try{return require('mysql2/promise')}catch{throw new Error('MySQL storage requires dependencies to be installed with npm install.')}}
async function openMysql(config){validateMysqlConfig(config);const pool=mysqlClient().createPool({host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,waitForConnections:true,connectionLimit:5,ssl:config.ssl?{rejectUnauthorized:true}:undefined});try{await pool.execute('CREATE TABLE IF NOT EXISTS raynet_crm_store (collection_name VARCHAR(80) PRIMARY KEY, payload LONGTEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');return pool}catch(error){await pool.end().catch(()=>{});throw error}}
async function importJsonToMysql(pool){for(const file of storageFiles){const collection=path.basename(file,'.json'),payload=fs.existsSync(file)?fs.readFileSync(file,'utf8'):mysqlMemory.get(collection);if(!payload)throw new Error(`Local collection ${collection} is unavailable for migration.`);JSON.parse(payload);mysqlMemory.set(collection,payload);await pool.execute('INSERT INTO raynet_crm_store (collection_name,payload) VALUES (?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload), updated_at=CURRENT_TIMESTAMP',[collection,payload])}}
function saveStorageConfig(config){const safe={driver:config.driver};if(config.driver==='mysql')Object.assign(safe,{host:config.host,port:config.port,database:config.database,user:config.user,password:config.password,ssl:config.ssl,keepJsonCache:config.keepJsonCache!==false});const temp=storageConfigFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(safe,null,2)+'\n',{mode:0o600});fs.renameSync(temp,storageConfigFile);savedStorageConfig=safe}
async function activateMysql(config,{importLocal=false,persist=false}={}){const pool=await openMysql(config);try{if(importLocal)await importJsonToMysql(pool);else for(const file of storageFiles){const collection=path.basename(file,'.json'),[rows]=await pool.execute('SELECT payload FROM raynet_crm_store WHERE collection_name=?',[collection]);if(rows.length){const payload=String(rows[0].payload);JSON.parse(payload);mysqlMemory.set(collection,payload);if(config.keepJsonCache!==false)fs.writeFileSync(file,payload.endsWith('\n')?payload:payload+'\n')}else{const payload=fs.readFileSync(file,'utf8');mysqlMemory.set(collection,payload);await pool.execute('INSERT INTO raynet_crm_store (collection_name,payload) VALUES (?,?)',[collection,payload])}}await mysqlWriteQueue;if(mysqlPool)await mysqlPool.end();mysqlPool=pool;storageDriver='mysql';if(persist)saveStorageConfig(config);if(config.keepJsonCache===false)for(const file of storageFiles){fs.rmSync(file,{force:true});fs.rmSync(file+'.tmp',{force:true})}}catch(error){await pool.end().catch(()=>{});throw error}}
async function initialiseStorage(){if(storageDriver==='json')return;if(storageDriver!=='mysql')throw new Error('STORAGE_DRIVER must be json or mysql.');const config=mysqlConfigFrom(savedStorageConfig);await activateMysql(config);console.log(`Storage driver: MySQL (${config.host}/${config.database})`)}
async function disableJsonCache(){if(storageDriver!=='mysql'||!mysqlPool)throw new Error('MySQL must be active before local JSON records can be removed.');await mysqlWriteQueue;for(const file of storageFiles){const collection=path.basename(file,'.json'),[rows]=await mysqlPool.execute('SELECT payload FROM raynet_crm_store WHERE collection_name=?',[collection]);if(!rows.length)throw new Error(`MySQL verification failed for ${collection}. No local files were removed.`);const payload=String(rows[0].payload);JSON.parse(payload);mysqlMemory.set(collection,payload)}const config=mysqlConfigFrom({...savedStorageConfig,keepJsonCache:false});saveStorageConfig(config);for(const file of storageFiles){fs.rmSync(file,{force:true});fs.rmSync(file+'.tmp',{force:true})}return storageFiles.length}
function publicUser(user) { return {id:user.id,name:user.name,email:user.email,role:user.role,memberId:user.memberId||null,active:user.active,createdAt:user.createdAt,lastLogin:user.lastLogin||null}; }
function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password,salt,64).toString('hex')}`; }
function verifyPassword(password,stored) { const [salt,expected]=String(stored).split(':'); if(!salt||!expected)return false; const actual=crypto.scryptSync(password,salt,64), expectedBuffer=Buffer.from(expected,'hex'); return actual.length===expectedBuffer.length&&crypto.timingSafeEqual(actual,expectedBuffer); }
function cookies(req) { return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(v=>{const i=v.indexOf('=');return[v.slice(0,i).trim(),decodeURIComponent(v.slice(i+1))];})); }
function tokenHash(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex');}
function readSessions(){const now=Date.now(),sessions=readCollection(sessionsFile).filter(session=>session.expires>now);return sessions;}
function writeSessions(sessions){writeCollection(sessionsFile,sessions);}
function currentUser(req) { const hash=tokenHash(cookies(req).raynet_session),session=readSessions().find(item=>item.tokenHash===hash);if(!session)return null;return readUsers().find(u=>u.id===session.userId&&u.active)||null; }
function json(res,status,body,headers={}) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve,reject)=>{let body='';req.on('data',c=>{body+=c;if(body.length>2500000)reject(new Error('Request too large'));});req.on('end',()=>{try{resolve(body?JSON.parse(body):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);}); }
function validPassword(password){return typeof password==='string'&&password.length>=10;}
function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||'').toLowerCase());}
function sessionCookie(token,maxAge=28800){return `raynet_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${appUrl.protocol==='https:'?'; Secure':''}`;}
function createSession(userId){const token=crypto.randomBytes(32).toString('hex'),sessions=readSessions();sessions.push({tokenHash:tokenHash(token),userId,expires:Date.now()+8*60*60*1000,createdAt:new Date().toISOString()});writeSessions(sessions);return token;}
function deleteSession(token){const hash=tokenHash(token);writeSessions(readSessions().filter(session=>session.tokenHash!==hash));}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return true;const forwardedProtocol=trustProxy?String(req.headers['x-forwarded-proto']||'').split(',')[0].trim():'';const protocol=forwardedProtocol||((req.socket.encrypted)?'https':'http'),requestOrigin=req.headers.host?`${protocol}://${req.headers.host}`:'';return trustedOrigins.has(origin)||origin===requestOrigin;}
function clientIp(req){return trustProxy?String(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress:req.socket.remoteAddress;}
function renewalStartDate(value){const parsed=new Date(value);return Number.isNaN(parsed.getTime())?new Date():parsed;}
function addRenewalYears(value,years=3){const date=renewalStartDate(value);date.setFullYear(date.getFullYear()+Number(years||3));return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function smtpResponse(socket){return new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>done(new Error('SMTP server timed out.')),12000);function done(error,value){clearTimeout(timer);socket.off('data',onData);socket.off('error',onError);error?reject(error):resolve(value)}function onError(error){done(error)}function onData(chunk){buffer+=chunk.toString();const lines=buffer.trimEnd().split(/\r?\n/);const last=lines[lines.length-1];if(/^\d{3} /.test(last))done(null,{code:Number(last.slice(0,3)),text:buffer.trim()})}socket.on('data',onData);socket.once('error',onError)})}
async function smtpWrite(socket,line,expected=[2,3]){socket.write(line+'\r\n');const result=await smtpResponse(socket);if(!expected.includes(Math.floor(result.code/100)))throw new Error(result.text);return result}
async function sendSmtpEmail(settings,message){let socket=settings.security==='tls'?tls.connect({host:settings.host,port:settings.port,servername:settings.host}):net.connect({host:settings.host,port:settings.port});let banner=await smtpResponse(socket);if(Math.floor(banner.code/100)!==2)throw new Error(banner.text);await smtpWrite(socket,'EHLO localhost');if(settings.security==='starttls'){await smtpWrite(socket,'STARTTLS',[2]);socket=tls.connect({socket,servername:settings.host});await new Promise((resolve,reject)=>{socket.once('secureConnect',resolve);socket.once('error',reject)});await smtpWrite(socket,'EHLO localhost')}if(settings.username){await smtpWrite(socket,'AUTH LOGIN',[3]);await smtpWrite(socket,Buffer.from(settings.username).toString('base64'),[3]);await smtpWrite(socket,Buffer.from(settings.password||'').toString('base64'),[2])}await smtpWrite(socket,`MAIL FROM:<${settings.fromEmail}>`);await smtpWrite(socket,`RCPT TO:<${message.to}>`);await smtpWrite(socket,'DATA',[3]);const headers=[`From: ${settings.fromName||settings.fromEmail} <${settings.fromEmail}>`,`To: ${message.to}`,`Subject: ${message.subject}`,`Reply-To: ${settings.replyTo||settings.fromEmail}`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8'];const body=message.html.replace(/^\./gm,'..');socket.write(headers.join('\r\n')+'\r\n\r\n'+body+'\r\n.\r\n');const sent=await smtpResponse(socket);if(Math.floor(sent.code/100)!==2)throw new Error(sent.text);socket.write('QUIT\r\n');socket.end()}
function templateText(value,variables){return String(value||'').replace(/{{(name|link|expiry|organisation)}}/g,(_,key)=>variables[key]||'')}
function emailHtml(text,branding){const escaped=String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');return `<!doctype html><html><body style="margin:0;background:#f5f6f9;font-family:Arial,sans-serif;color:#17272d"><div style="max-width:640px;margin:24px auto;background:white;border-radius:12px;overflow:hidden"><div style="background:${branding.primary};color:white;padding:24px;border-bottom:6px solid ${branding.accent}"><h1 style="margin:0;font-size:22px">${branding.name}</h1><p style="margin:5px 0 0;opacity:.8">Membership renewal</p></div><div style="padding:28px;line-height:1.6">${escaped}</div></div></body></html>`}
async function processRenewalAutomation(){const automation={...defaultRenewalAutomation,...readCollection(renewalAutomationFile)};if(!automation.enabled)return {sent:0,lapsed:0,skipped:true};const email=readCollection(emailSettingsFile);if(!email.host||!email.fromEmail)throw new Error('Email server settings are incomplete.');const renewals=readCollection(renewalsFile),members=readCollection(membersFile),branding=readBranding(),now=Date.now();let sent=0,lapsed=0;for(const renewal of renewals){if(['Renewing','Not renewing','Closed - no response'].includes(renewal.response))continue;const last=renewal.reminderSentAt?new Date(renewal.reminderSentAt).getTime():0,ageDays=last?(now-last)/86400000:Infinity;if((renewal.reminderCount||0)>=3){if(ageDays>=automation.lapseAfterDays){renewal.response='Closed - no response';renewal.closedAt=new Date().toISOString();const member=members.find(item=>String(item.id)===String(renewal.memberId));if(member)member.status='Lapsed';lapsed++}continue}const stage=renewal.reminderCount||0,required=stage===0?0:stage===1?automation.chaseAfterDays:automation.finalAfterDays;if(ageDays<required||!renewal.email)continue;const link=`${appUrl.origin}/?renewal=${renewal.token}`,variables={name:renewal.memberName,link,expiry:renewal.proposedExpiry?new Date(renewal.proposedExpiry+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'',organisation:branding.name},subject=templateText(stage===0?automation.initialSubject:stage===1?automation.chaseSubject:automation.finalSubject,variables),body=templateText(stage===0?automation.initialBody:stage===1?automation.chaseBody:automation.finalBody,variables);await sendSmtpEmail(email,{to:renewal.email,subject,html:emailHtml(body,branding)});renewal.response='No response';renewal.reminderCount=stage+1;renewal.reminderSentAt=new Date().toISOString();renewal.followUpDue=new Date(now+(stage===0?automation.chaseAfterDays:stage===1?automation.finalAfterDays:automation.lapseAfterDays)*86400000).toISOString();renewal.lastAutomationStage=stage===0?'Initial reminder':stage===1?'Chase':'Final chase';sent++}writeCollection(renewalsFile,renewals);writeCollection(membersFile,members);return {sent,lapsed,skipped:false}}

async function api(req,res,pathname){
  if(!sameOrigin(req))return json(res,403,{error:'Invalid request origin.'});
  const users=readUsers(), user=currentUser(req);
  if(pathname==='/api/branding'&&req.method==='GET')return json(res,200,{branding:readBranding()});
  if(pathname==='/api/public-site'&&req.method==='GET')return json(res,200,{settings:{...defaultPublicSite,...readCollection(publicSiteFile)}});
  if(pathname==='/api/events'&&req.method==='GET')return json(res,200,{events:readCollection(eventsFile)});
  if(pathname==='/api/auth/status'&&req.method==='GET')return json(res,200,{setupRequired:users.length===0,user:user?publicUser(user):null});
  if(pathname==='/api/auth/setup'&&req.method==='POST'){
    if(users.length)return json(res,409,{error:'Initial setup has already been completed.'});
    const body=await readBody(req);
    if(!body.name?.trim()||!validEmail(body.email))return json(res,400,{error:'Enter a name and valid email address.'});
    if(!validPassword(body.password))return json(res,400,{error:'Password must be at least 10 characters.'});
    const setupStorage=body.storage||{driver:body.storageDriver,host:body.mysqlHost,port:body.mysqlPort,database:body.mysqlDatabase,user:body.mysqlUser,password:body.mysqlPassword,ssl:body.mysqlSsl===true||body.mysqlSsl==='on'};let setupMysqlConfig=null;if(setupStorage.driver==='mysql'){setupMysqlConfig=mysqlConfigFrom(setupStorage);try{const testPool=await openMysql(setupMysqlConfig);await testPool.end()}catch(error){return json(res,400,{error:`Could not connect to MySQL: ${error.message}`})}}
    const memberData=body.member||(body.memberData?JSON.parse(body.memberData):{}), member={id:crypto.randomUUID(),name:body.name.trim(),call:String(memberData.call||'').trim(),membershipNumber:String(memberData.membershipNumber||'').trim(),raynetEmail:String(memberData.raynetEmail||body.email).trim().toLowerCase(),personalEmail:String(memberData.personalEmail||'').trim().toLowerCase(),mobilePhone:String(memberData.mobilePhone||'').trim(),homePhone:String(memberData.homePhone||'').trim(),address:String(memberData.address||'').trim(),membershipType:memberData.membershipType||'Member',committeePositions:Array.isArray(memberData.committeePositions)?memberData.committeePositions:[],status:'Active',renewal:memberData.renewal||'—',createdAt:new Date().toISOString()};
    const admin={id:crypto.randomUUID(),name:body.name.trim(),email:body.email.trim().toLowerCase(),role:'admin',memberId:member.id,active:true,passwordHash:hashPassword(body.password),createdAt:new Date().toISOString(),lastLogin:new Date().toISOString()};
    const installSamples=body.includeSampleData===true;
    const members=[member,...(installSamples?sampleMembers.map(item=>({...item,id:crypto.randomUUID(),createdAt:new Date().toISOString(),sample:true})):[])];
    const organisations=installSamples?sampleOrganisations.map(item=>({...item,id:crypto.randomUUID(),sample:true})):[];
    writeCollection(membersFile,members);writeCollection(organisationsFile,organisations);writeCollection(eventsFile,installSamples?sampleEvents:[]);writeCollection(renewalsFile,[]);writeCollection(responsesFile,[]);writeCollection(guestHelpersFile,[]);writeUsers([admin]);const token=createSession(admin.id);if(setupMysqlConfig){await activateMysql(setupMysqlConfig,{importLocal:true,persist:true});await disableJsonCache()}return json(res,201,{user:publicUser(admin),member,sampleData:installSamples,storageDriver},{'Set-Cookie':sessionCookie(token)});
  }
  if(pathname==='/api/auth/login'&&req.method==='POST'){
    const ip=clientIp(req)||'local', attempt=loginAttempts.get(ip)||{count:0,until:0};
    if(attempt.until>Date.now())return json(res,429,{error:'Too many attempts. Please wait a few minutes.'});
    const body=await readBody(req), email=String(body.email||'').trim().toLowerCase(), found=users.find(u=>u.email===email&&u.active&&verifyPassword(String(body.password||''),u.passwordHash));
    if(!found){attempt.count++;if(attempt.count>=5){attempt.until=Date.now()+5*60*1000;attempt.count=0;}loginAttempts.set(ip,attempt);return json(res,401,{error:'Email address or password is incorrect.'});}
    loginAttempts.delete(ip);found.lastLogin=new Date().toISOString();writeUsers(users);const token=createSession(found.id);return json(res,200,{user:publicUser(found)},{'Set-Cookie':sessionCookie(token)});
  }
  if(pathname==='/api/auth/logout'&&req.method==='POST'){const token=cookies(req).raynet_session;if(token)deleteSession(token);return json(res,200,{ok:true},{'Set-Cookie':sessionCookie('',0)});}
  const publicRenewalMatch=pathname.match(/^\/api\/renewal-response\/([^/]+)$/);
  if(publicRenewalMatch&&req.method==='GET'){const renewals=readCollection(renewalsFile),renewal=renewals.find(item=>item.token===publicRenewalMatch[1]);if(!renewal)return json(res,404,{error:'This renewal link is invalid.'});if(!renewal.proposedExpiry){const member=readCollection(membersFile).find(item=>String(item.id)===String(renewal.memberId)),term=readSettings().renewalTermYears||3;renewal.currentExpiry=member?.renewal||renewal.currentExpiry||'';renewal.renewalYears=Number(renewal.renewalYears||term);renewal.proposedExpiry=addRenewalYears(renewal.currentExpiry,renewal.renewalYears);renewal.membershipYear=`${renewal.renewalYears}-year term`;writeCollection(renewalsFile,renewals)}const proposedLabel=renewal.proposedExpiry?new Date(renewal.proposedExpiry+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}):'the new expiry date';return json(res,200,{renewal:{memberName:renewal.memberName,membershipYear:`a ${renewal.renewalYears||3}-year term, until ${proposedLabel}`,currentExpiry:renewal.currentExpiry,proposedExpiry:renewal.proposedExpiry,renewalYears:renewal.renewalYears,response:renewal.response}});}
  if(publicRenewalMatch&&req.method==='POST'){const body=await readBody(req);if(!['Renewing','Not renewing'].includes(body.response))return json(res,400,{error:'Choose whether you wish to renew.'});const renewals=readCollection(renewalsFile),renewal=renewals.find(item=>item.token===publicRenewalMatch[1]);if(!renewal)return json(res,404,{error:'This renewal link is invalid.'});renewal.response=body.response;renewal.respondedAt=new Date().toISOString();renewal.responseNote=String(body.note||'').trim().slice(0,1000);writeCollection(renewalsFile,renewals);if(body.response==='Renewing'&&renewal.proposedExpiry){const members=readCollection(membersFile),member=members.find(item=>String(item.id)===String(renewal.memberId));if(member){member.renewal=new Date(renewal.proposedExpiry+'T12:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});member.status='Active';writeCollection(membersFile,members)}}return json(res,200,{ok:true,response:renewal.response,proposedExpiry:renewal.proposedExpiry});}
  if(pathname==='/api/guest-interest'&&req.method==='POST'){
    const ip=clientIp(req)||'local',now=Date.now(),recent=(guestInterestAttempts.get(ip)||[]).filter(time=>now-time<60*60*1000);
    if(recent.length>=5)return json(res,429,{error:'Too many requests have been submitted. Please try again later.'});
    const body=await readBody(req);if(String(body.website||'').trim())return json(res,201,{ok:true});
    const name=String(body.name||'').trim(),group=String(body.group||'').trim(),email=String(body.email||'').trim().toLowerCase(),phone=String(body.phone||'').trim();
    if(!name||!group)return json(res,400,{error:'Enter your name and group or organisation.'});
    if(!email&&!phone)return json(res,400,{error:'Enter an email address or phone number.'});
    if(email&&!validEmail(email))return json(res,400,{error:'Enter a valid email address.'});
    const linkedEvent=readCollection(eventsFile).find(item=>String(item.id)===String(body.eventId||''));if(!linkedEvent)return json(res,404,{error:'That event is no longer available.'});
    const record={id:crypto.randomUUID(),eventId:String(linkedEvent.id).slice(0,100),eventTitle:String(linkedEvent.title||'Event').trim().slice(0,160),eventDate:String(linkedEvent.fullDate||linkedEvent.date||'').slice(0,40),name:name.slice(0,120),callsign:String(body.callsign||'').trim().slice(0,30),group:group.slice(0,120),email:email.slice(0,160),phone:phone.slice(0,50),notes:String(body.notes||'').trim().slice(0,1000),status:'New',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    const records=readCollection(guestHelpersFile);records.unshift(record);writeCollection(guestHelpersFile,records);recent.push(now);guestInterestAttempts.set(ip,recent);return json(res,201,{ok:true,id:record.id});
  }
  if(!user)return json(res,401,{error:'Please sign in.'});
  if(pathname==='/api/storage-settings'&&req.method==='GET'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const config=mysqlConfigFrom(savedStorageConfig);return json(res,200,{settings:{driver:storageDriver,host:config.host,port:config.port,database:config.database,user:config.user,ssl:config.ssl,passwordConfigured:Boolean(config.password),jsonCacheEnabled:jsonCacheEnabled(),environmentManaged:Boolean(process.env.STORAGE_DRIVER||process.env.MYSQL_HOST)}});
  }
  if(pathname==='/api/storage-settings/test'&&req.method==='POST'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const body=await readBody(req),config=mysqlConfigFrom({...body,password:String(body.password||savedStorageConfig.password||'')});try{const pool=await openMysql(config);await pool.end();return json(res,200,{ok:true,message:'Connected to MySQL successfully.'})}catch(error){return json(res,400,{error:`Could not connect to MySQL: ${error.message}`})}
  }
  if(pathname==='/api/storage-settings'&&req.method==='PUT'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});if(process.env.STORAGE_DRIVER||process.env.MYSQL_HOST)return json(res,409,{error:'Storage is managed by server environment variables. Change those values and restart the service.'});const body=await readBody(req);if(body.driver==='json'){await mysqlWriteQueue;for(const file of storageFiles){const collection=path.basename(file,'.json'),payload=mysqlMemory.get(collection);if(payload)fs.writeFileSync(file,payload)}if(mysqlPool){await mysqlPool.end();mysqlPool=null}storageDriver='json';mysqlMemory.clear();saveStorageConfig({driver:'json'});return json(res,200,{ok:true,driver:'json',message:'JSON storage is active. Local record files have been restored from MySQL.'})}if(body.driver!=='mysql')return json(res,400,{error:'Choose JSON or MySQL storage.'});const config=mysqlConfigFrom({...body,password:String(body.password||savedStorageConfig.password||'')});try{await activateMysql(config,{importLocal:true,persist:true});return json(res,200,{ok:true,driver:'mysql',migratedCollections:storageFiles.length,message:'MySQL is active and the current JSON records have been imported.'})}catch(error){return json(res,400,{error:`Could not migrate to MySQL: ${error.message}`})}
  }
  if(pathname==='/api/storage-settings/json-cache'&&req.method==='DELETE'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});try{const removed=await disableJsonCache();return json(res,200,{ok:true,removed,message:'Local JSON record files were removed. MySQL-only mode is active.'})}catch(error){return json(res,409,{error:error.message})}
  }
  if(pathname==='/api/guest-helpers'&&req.method==='GET'){if(!['admin','coordinator','viewer'].includes(user.role))return json(res,403,{error:'Staff access required.'});return json(res,200,{helpers:readCollection(guestHelpersFile)});}
  if(pathname==='/api/guest-helpers/archive-past'&&req.method==='POST'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const records=readCollection(guestHelpersFile),today=new Date().toISOString().slice(0,10),now=new Date().toISOString();let archived=0;for(const record of records){const eventDate=String(record.eventDate||'').slice(0,10);if(!record.archivedAt&&/^\d{4}-\d{2}-\d{2}$/.test(eventDate)&&eventDate<today){record.archivedAt=now;record.updatedAt=now;archived++}}if(archived)writeCollection(guestHelpersFile,records);return json(res,200,{helpers:records,archived});
  }
  const guestHelperMatch=pathname.match(/^\/api\/guest-helpers\/([^/]+)$/);
  if(guestHelperMatch&&req.method==='PATCH'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const records=readCollection(guestHelpersFile),record=records.find(item=>item.id===guestHelperMatch[1]);if(!record)return json(res,404,{error:'Guest helper record not found.'});const body=await readBody(req);if(body.status!==undefined){if(!['New','Contacted','Confirmed','Declined'].includes(body.status))return json(res,400,{error:'Choose a valid status.'});record.status=body.status}if(body.archived!==undefined)record.archivedAt=body.archived?new Date().toISOString():null;record.updatedAt=new Date().toISOString();writeCollection(guestHelpersFile,records);return json(res,200,{helper:record});
  }
  if(guestHelperMatch&&req.method==='DELETE'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const records=readCollection(guestHelpersFile),remaining=records.filter(item=>item.id!==guestHelperMatch[1]);if(remaining.length===records.length)return json(res,404,{error:'Guest helper record not found.'});writeCollection(guestHelpersFile,remaining);return json(res,200,{ok:true});
  }
  if(pathname==='/api/events/import'&&req.method==='POST'){if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const existing=readCollection(eventsFile);if(existing.length)return json(res,200,{events:existing});const body=await readBody(req),events=Array.isArray(body.events)?body.events.slice(0,1000):[];writeCollection(eventsFile,events);return json(res,201,{events});}
  if(pathname==='/api/events'&&req.method==='POST'){if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const body=await readBody(req);if(!String(body.title||'').trim()||!String(body.fullDate||'').trim())return json(res,400,{error:'Enter an event name and date.'});const events=readCollection(eventsFile),event={id:crypto.randomUUID(),title:String(body.title).trim().slice(0,160),fullDate:String(body.fullDate).slice(0,10),date:String(body.date||'').slice(0,30),time:String(body.time||'').slice(0,10),needed:Math.max(1,Number(body.needed)||1),organisationId:String(body.organisationId||'').slice(0,100),location:String(body.location||'').trim().slice(0,200),desc:String(body.desc||'').trim().slice(0,2000),yes:0,tone:String(body.tone||''),createdAt:new Date().toISOString()};events.push(event);writeCollection(eventsFile,events);return json(res,201,{event});}
  const eventMatch=pathname.match(/^\/api\/events\/([^/]+)$/);
  if(eventMatch&&req.method==='PATCH'){if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const events=readCollection(eventsFile),event=events.find(item=>String(item.id)===eventMatch[1]);if(!event)return json(res,404,{error:'Event not found.'});const body=await readBody(req);for(const field of ['title','fullDate','date','time','organisationId','location','desc','tone'])if(body[field]!==undefined)event[field]=String(body[field]).trim();if(body.needed!==undefined)event.needed=Math.max(1,Number(body.needed)||1);event.updatedAt=new Date().toISOString();writeCollection(eventsFile,events);return json(res,200,{event});}
  if(pathname==='/api/settings'&&req.method==='GET')return json(res,200,{settings:readSettings()});
  if(pathname==='/api/public-site'&&req.method==='PUT'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});
    const body=await readBody(req),clean={heroTitle:String(body.heroTitle||'').trim().slice(0,140),heroText:String(body.heroText||'').trim().slice(0,800),links:Array.isArray(body.links)?body.links.slice(0,20).map(item=>({title:String(item.title||'').trim().slice(0,80),url:String(item.url||'').trim().slice(0,500),description:String(item.description||'').trim().slice(0,240)})).filter(item=>item.title&&/^https?:\/\//i.test(item.url)):[],news:Array.isArray(body.news)?body.news.slice(0,30).map(item=>({title:String(item.title||'').trim().slice(0,120),date:String(item.date||'').slice(0,10),summary:String(item.summary||'').trim().slice(0,1000)})).filter(item=>item.title&&item.summary):[]};
    if(!clean.heroTitle||!clean.heroText)return json(res,400,{error:'Enter a homepage heading and introduction.'});writeCollection(publicSiteFile,clean);return json(res,200,{settings:clean});
  }
  if(pathname==='/api/email-settings'&&req.method==='GET'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const settings=readCollection(emailSettingsFile);return json(res,200,{settings:{...settings,password:undefined,passwordConfigured:Boolean(settings.password)}});
  }
  if(pathname==='/api/email-settings'&&req.method==='PUT'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const body=await readBody(req),existing=readCollection(emailSettingsFile),portNumber=Number(body.port);if(!String(body.host||'').trim()||!Number.isInteger(portNumber)||portNumber<1||portNumber>65535)return json(res,400,{error:'Enter a valid SMTP host and port.'});if(!['starttls','tls','none'].includes(body.security))return json(res,400,{error:'Choose a valid connection security option.'});if(body.fromEmail&&!validEmail(body.fromEmail))return json(res,400,{error:'Enter a valid sender email address.'});if(body.replyTo&&!validEmail(body.replyTo))return json(res,400,{error:'Enter a valid reply-to email address.'});const settings={host:String(body.host).trim(),port:portNumber,security:body.security,username:String(body.username||'').trim(),password:String(body.password||existing.password||''),fromName:String(body.fromName||'').trim(),fromEmail:String(body.fromEmail||'').trim().toLowerCase(),replyTo:String(body.replyTo||'').trim().toLowerCase()};writeCollection(emailSettingsFile,settings);return json(res,200,{settings:{...settings,password:undefined,passwordConfigured:Boolean(settings.password)}});
  }
  if(pathname==='/api/email-settings/test'&&req.method==='POST'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const settings=readCollection(emailSettingsFile);if(!settings.host||!settings.port)return json(res,400,{error:'Save the SMTP server settings first.'});const net=require('net'),tls=require('tls');try{const banner=await new Promise((resolve,reject)=>{const socket=settings.security==='tls'?tls.connect({host:settings.host,port:settings.port,servername:settings.host}):net.connect({host:settings.host,port:settings.port});const timer=setTimeout(()=>{socket.destroy();reject(new Error('Connection timed out.'))},8000);socket.once('error',error=>{clearTimeout(timer);reject(error)});socket.once('data',data=>{clearTimeout(timer);const value=data.toString().trim();socket.end();resolve(value)});socket.once('connect',()=>{if(settings.security==='tls'&&socket.authorized===false){clearTimeout(timer);socket.destroy();reject(new Error(socket.authorizationError||'TLS certificate validation failed.'))}})});return json(res,200,{ok:true,message:'SMTP server reached successfully.',banner:banner.slice(0,200)})}catch(error){return json(res,400,{error:`Could not connect to the SMTP server: ${error.message}`})}
  }
  if(pathname==='/api/renewal-automation'&&req.method==='GET'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});return json(res,200,{settings:{...defaultRenewalAutomation,...readCollection(renewalAutomationFile)}});
  }
  if(pathname==='/api/renewal-automation'&&req.method==='PUT'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const body=await readBody(req),numberFields=['chaseAfterDays','finalAfterDays','lapseAfterDays'];for(const field of numberFields){const value=Number(body[field]);if(!Number.isInteger(value)||value<1||value>365)return json(res,400,{error:'Automation delays must be between 1 and 365 days.'})}const settings={enabled:body.enabled===true,chaseAfterDays:Number(body.chaseAfterDays),finalAfterDays:Number(body.finalAfterDays),lapseAfterDays:Number(body.lapseAfterDays),initialSubject:String(body.initialSubject||'').trim(),initialBody:String(body.initialBody||'').trim(),chaseSubject:String(body.chaseSubject||'').trim(),chaseBody:String(body.chaseBody||'').trim(),finalSubject:String(body.finalSubject||'').trim(),finalBody:String(body.finalBody||'').trim()};if(!settings.initialSubject||!settings.initialBody||!settings.chaseSubject||!settings.chaseBody||!settings.finalSubject||!settings.finalBody)return json(res,400,{error:'Complete all three email templates.'});writeCollection(renewalAutomationFile,settings);return json(res,200,{settings});
  }
  if(pathname==='/api/renewal-automation/run'&&req.method==='POST'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});try{return json(res,200,await processRenewalAutomation())}catch(error){return json(res,400,{error:error.message})}
  }
  if(pathname==='/api/settings'&&req.method==='PUT'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const body=await readBody(req);
    if(!Array.isArray(body.committeePositions))return json(res,400,{error:'Committee positions must be a list.'});
    const committeePositions=[...new Set(body.committeePositions.map(v=>String(v).trim()).filter(Boolean))].slice(0,50);
    if(!committeePositions.length)return json(res,400,{error:'Add at least one committee position.'});
    const settings={committeePositions};writeSettings(settings);return json(res,200,{settings});
  }
  if(pathname==='/api/branding'&&req.method==='PUT'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});
    const body=await readBody(req), existing=readBranding();
    const hex=/^#[0-9a-f]{6}$/i;
    if(!body.name?.trim()||!body.shortName?.trim()||!hex.test(body.primary)||!hex.test(body.accent))return json(res,400,{error:'Enter names and valid theme colours.'});
    let logo=existing.logo;
    if(body.logo){if(!(String(body.logo).startsWith('/assets/')||/^data:image\/(png|jpeg|webp);base64,/.test(body.logo)))return json(res,400,{error:'Logo must be a PNG, JPEG or WebP image.'});logo=body.logo;}
    const branding={name:body.name.trim().slice(0,80),shortName:body.shortName.trim().slice(0,40),subtitle:String(body.subtitle||'Member CRM').trim().slice(0,60),primary:body.primary.toLowerCase(),accent:body.accent.toLowerCase(),logo};
    writeBranding(branding);return json(res,200,{branding});
  }
  if(pathname==='/api/users'&&req.method==='GET'){if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});return json(res,200,{users:users.map(publicUser)});}
  if(pathname==='/api/users'&&req.method==='POST'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const body=await readBody(req);
    if(!body.name?.trim()||!validEmail(body.email))return json(res,400,{error:'Enter a name and valid email address.'});
    if(!validPassword(body.password))return json(res,400,{error:'Temporary password must be at least 10 characters.'});
    if(users.some(u=>u.email===body.email.trim().toLowerCase()))return json(res,409,{error:'A user with that email already exists.'});
    if(!['admin','coordinator','viewer','member'].includes(body.role))return json(res,400,{error:'Invalid role.'});
    const added={id:crypto.randomUUID(),name:body.name.trim(),email:body.email.trim().toLowerCase(),role:body.role,memberId:body.memberId?String(body.memberId):null,active:true,passwordHash:hashPassword(body.password),createdAt:new Date().toISOString(),lastLogin:null};users.push(added);writeUsers(users);return json(res,201,{user:publicUser(added)});
  }
  const match=pathname.match(/^\/api\/users\/([^/]+)$/);
  if(match&&req.method==='PATCH'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const target=users.find(u=>u.id===match[1]);if(!target)return json(res,404,{error:'User not found.'});const body=await readBody(req);
    if(body.active===false&&target.id===user.id)return json(res,400,{error:'You cannot disable your own account.'});
    if(body.name!==undefined){if(!String(body.name).trim())return json(res,400,{error:'Enter the user’s full name.'});target.name=String(body.name).trim().slice(0,100);}
    if(body.email!==undefined){const email=String(body.email).trim().toLowerCase();if(!validEmail(email))return json(res,400,{error:'Enter a valid email address.'});if(users.some(u=>u.id!==target.id&&u.email===email))return json(res,409,{error:'Another user already has that email address.'});target.email=email;}
    if(body.memberId!==undefined){const memberId=body.memberId?String(body.memberId):null;if(memberId&&users.some(u=>u.id!==target.id&&String(u.memberId)===memberId))return json(res,409,{error:'That member is already linked to another user account.'});target.memberId=memberId;}
    if(body.role&&target.id===user.id&&body.role!==target.role)return json(res,400,{error:'You cannot change your own administrator role.'});
    if(body.role&&target.role==='admin'&&body.role!=='admin'&&users.filter(u=>u.active&&u.role==='admin').length===1)return json(res,400,{error:'At least one active administrator is required.'});
    if(typeof body.active==='boolean')target.active=body.active;if(body.role&&['admin','coordinator','viewer','member'].includes(body.role))target.role=body.role;
    if(body.password){if(!validPassword(body.password))return json(res,400,{error:'Password must be at least 10 characters.'});target.passwordHash=hashPassword(body.password);}
    writeUsers(users);return json(res,200,{user:publicUser(target)});
  }
  if(pathname==='/api/members'&&req.method==='GET')return json(res,200,{members:readCollection(membersFile)});
  if(pathname==='/api/organisations'&&req.method==='GET')return json(res,200,{organisations:readCollection(organisationsFile)});
  if(pathname==='/api/renewals'&&req.method==='GET'){
    const members=readCollection(membersFile),renewals=readCollection(renewalsFile),term=readSettings().renewalTermYears||3;for(const member of members){let renewal=renewals.find(item=>String(item.memberId)===String(member.id));if(!renewal){renewal={id:crypto.randomUUID(),memberId:member.id,memberName:member.name,call:member.call||'',email:member.raynetEmail||member.personalEmail||'',response:'Not sent',reminderCount:0,reminderSentAt:null,followUpDue:null,respondedAt:null,responseNote:'',token:crypto.randomBytes(24).toString('hex')};renewals.push(renewal)}renewal.memberName=member.name;renewal.call=member.call||'';renewal.email=member.raynetEmail||member.personalEmail||'';renewal.currentExpiry=renewal.currentExpiry||member.renewal||'';renewal.renewalYears=Number(renewal.renewalYears||term);renewal.proposedExpiry=renewal.proposedExpiry||addRenewalYears(renewal.currentExpiry,renewal.renewalYears);renewal.membershipYear=`${renewal.renewalYears}-year term`;}writeCollection(renewalsFile,renewals);return json(res,200,{renewals});
  }
  if(pathname==='/api/renewals/send'&&req.method==='POST'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const body=await readBody(req),ids=Array.isArray(body.ids)?body.ids.map(String):[],renewals=readCollection(renewalsFile),now=new Date(),followUp=new Date(now);followUp.setDate(followUp.getDate()+14);let updated=0;for(const renewal of renewals){if(ids.length&&!ids.includes(String(renewal.id)))continue;if(['Renewing','Not renewing'].includes(renewal.response))continue;renewal.response='No response';renewal.reminderCount=(renewal.reminderCount||0)+1;renewal.reminderSentAt=now.toISOString();renewal.followUpDue=followUp.toISOString();renewal.lastMessage=String(body.message||'').trim();updated++}writeCollection(renewalsFile,renewals);return json(res,200,{renewals,updated,delivery:'logged'});
  }
  const renewalMatch=pathname.match(/^\/api\/renewals\/([^/]+)$/);
  if(renewalMatch&&req.method==='PATCH'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const body=await readBody(req),renewals=readCollection(renewalsFile),renewal=renewals.find(item=>item.id===renewalMatch[1]);if(!renewal)return json(res,404,{error:'Renewal record not found.'});if(body.response&&['Not sent','No response','Renewing','Not renewing'].includes(body.response)){renewal.response=body.response;renewal.respondedAt=['Renewing','Not renewing'].includes(body.response)?new Date().toISOString():null}if(body.responseNote!==undefined)renewal.responseNote=String(body.responseNote).trim().slice(0,1000);if(body.renewalYears!==undefined){const years=Number(body.renewalYears);if(!Number.isInteger(years)||years<1||years>10)return json(res,400,{error:'Renewal term must be between 1 and 10 years.'});renewal.renewalYears=years;renewal.proposedExpiry=addRenewalYears(renewal.currentExpiry,years)}if(body.proposedExpiry!==undefined){const expiry=String(body.proposedExpiry);if(!/^\d{4}-\d{2}-\d{2}$/.test(expiry))return json(res,400,{error:'Enter a valid proposed expiry date.'});renewal.proposedExpiry=expiry}writeCollection(renewalsFile,renewals);return json(res,200,{renewal});
  }
  if(pathname==='/api/organisations/import'&&req.method==='POST'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const existing=readCollection(organisationsFile);if(existing.length)return json(res,200,{organisations:existing});const body=await readBody(req),organisations=Array.isArray(body.organisations)?body.organisations:[];writeCollection(organisationsFile,organisations);return json(res,201,{organisations});
  }
  if(pathname==='/api/organisations'&&req.method==='POST'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const body=await readBody(req);if(!String(body.name||'').trim())return json(res,400,{error:'Enter an organisation name.'});const organisations=readCollection(organisationsFile),organisation={id:crypto.randomUUID(),name:String(body.name).trim(),type:String(body.type||'Other').trim(),desc:String(body.desc||'').trim(),address:String(body.address||'').trim(),website:String(body.website||'').trim(),contacts:[],last:'Never',initials:String(body.name).trim().split(/\s+/).map(v=>v[0]).slice(0,2).join('').toUpperCase(),createdAt:new Date().toISOString()};organisations.unshift(organisation);writeCollection(organisationsFile,organisations);return json(res,201,{organisation});
  }
  const organisationMatch=pathname.match(/^\/api\/organisations\/([^/]+)$/);
  if(organisationMatch&&req.method==='PATCH'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const organisations=readCollection(organisationsFile),organisation=organisations.find(o=>String(o.id)===organisationMatch[1]);if(!organisation)return json(res,404,{error:'End user not found.'});const body=await readBody(req);for(const field of ['name','type','desc','address','website'])if(body[field]!==undefined)organisation[field]=String(body[field]).trim();if(!organisation.name)return json(res,400,{error:'Enter an organisation name.'});organisation.initials=organisation.name.split(/\s+/).map(v=>v[0]).slice(0,2).join('').toUpperCase();writeCollection(organisationsFile,organisations);return json(res,200,{organisation});
  }
  if(organisationMatch&&req.method==='DELETE'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const organisations=readCollection(organisationsFile),remaining=organisations.filter(o=>String(o.id)!==organisationMatch[1]);if(remaining.length===organisations.length)return json(res,404,{error:'End user not found.'});writeCollection(organisationsFile,remaining);return json(res,200,{ok:true});
  }
  const contactMatch=pathname.match(/^\/api\/organisations\/([^/]+)\/contacts(?:\/([^/]+))?$/);
  if(contactMatch&&req.method==='POST'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const organisations=readCollection(organisationsFile),organisation=organisations.find(o=>String(o.id)===contactMatch[1]);if(!organisation)return json(res,404,{error:'End user not found.'});const body=await readBody(req);if(!String(body.name||'').trim())return json(res,400,{error:'Enter the contact’s name.'});organisation.contacts=Array.isArray(organisation.contacts)?organisation.contacts:[];const contact={id:crypto.randomUUID(),name:String(body.name).trim(),jobTitle:String(body.jobTitle||'').trim(),email:String(body.email||'').trim().toLowerCase(),phone:String(body.phone||'').trim(),mobile:String(body.mobile||'').trim(),notes:String(body.notes||'').trim()};if(contact.email&&!validEmail(contact.email))return json(res,400,{error:'Enter a valid contact email.'});organisation.contacts.push(contact);organisation.last=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});writeCollection(organisationsFile,organisations);return json(res,201,{organisation,contact});
  }
  if(contactMatch&&req.method==='PATCH'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const organisations=readCollection(organisationsFile),organisation=organisations.find(o=>String(o.id)===contactMatch[1]),contact=organisation?.contacts?.find(c=>String(c.id)===contactMatch[2]);if(!contact)return json(res,404,{error:'Contact not found.'});const body=await readBody(req);for(const field of ['name','jobTitle','email','phone','mobile','notes'])if(body[field]!==undefined)contact[field]=String(body[field]).trim();if(!contact.name)return json(res,400,{error:'Enter the contact’s name.'});if(contact.email&&!validEmail(contact.email))return json(res,400,{error:'Enter a valid contact email.'});organisation.last=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});writeCollection(organisationsFile,organisations);return json(res,200,{organisation,contact});
  }
  if(contactMatch&&req.method==='DELETE'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const organisations=readCollection(organisationsFile),organisation=organisations.find(o=>String(o.id)===contactMatch[1]);if(!organisation)return json(res,404,{error:'End user not found.'});organisation.contacts=(organisation.contacts||[]).filter(c=>String(c.id)!==contactMatch[2]);writeCollection(organisationsFile,organisations);return json(res,200,{organisation});
  }
  if(pathname==='/api/members/import'&&req.method==='POST'){
    if(user.role!=='admin')return json(res,403,{error:'Administrator access required.'});const existing=readCollection(membersFile);if(existing.length)return json(res,200,{members:existing});const body=await readBody(req),members=Array.isArray(body.members)?body.members:[];const ownMember=members.find(m=>[m.raynetEmail,m.personalEmail,m.email].some(email=>String(email||'').trim().toLowerCase()===user.email));if(ownMember){const storedUser=users.find(u=>u.id===user.id);storedUser.memberId=ownMember.id;writeUsers(users)}writeCollection(membersFile,members);return json(res,201,{members});
  }
  if(pathname==='/api/members'&&req.method==='POST'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const body=await readBody(req),members=readCollection(membersFile);const member={...body,id:String(body.id||crypto.randomUUID()),createdAt:new Date().toISOString()};delete member.portalAccess;delete member.accessRole;delete member.temporaryPassword;members.unshift(member);
    if(body.portalAccess){const email=String(body.raynetEmail||body.personalEmail||'').trim().toLowerCase();if(!validEmail(email)||!validPassword(body.temporaryPassword))return json(res,400,{error:'A valid email and temporary password of at least 10 characters are required for portal access.'});if(users.some(u=>u.email===email))return json(res,409,{error:'A user with that email already exists.'});users.push({id:crypto.randomUUID(),name:member.name,email,role:body.accessRole||'member',memberId:member.id,active:true,passwordHash:hashPassword(body.temporaryPassword),createdAt:new Date().toISOString(),lastLogin:null});writeUsers(users)}writeCollection(membersFile,members);return json(res,201,{member});
  }
  const memberMatch=pathname.match(/^\/api\/members\/([^/]+)$/);
  if(memberMatch&&req.method==='PATCH'){
    if(!['admin','coordinator'].includes(user.role))return json(res,403,{error:'Staff access required.'});const members=readCollection(membersFile),index=members.findIndex(m=>String(m.id)===memberMatch[1]);if(index<0)return json(res,404,{error:'Member not found.'});const body=await readBody(req),member={...members[index],...body};delete member.portalAccess;delete member.accessRole;delete member.temporaryPassword;members[index]=member;let linked=users.find(u=>String(u.memberId)===String(member.id));
    if(body.portalAccess){const email=String(body.raynetEmail||body.personalEmail||'').trim().toLowerCase();if(!validEmail(email))return json(res,400,{error:'A valid email is required for portal access.'});if(!linked)linked=users.find(u=>u.email===email&&!u.memberId);if(linked){if(users.some(u=>u.id!==linked.id&&u.email===email))return json(res,409,{error:'That email is already used by another account.'});linked.name=member.name;linked.email=email;linked.memberId=member.id;linked.role=body.accessRole||linked.role;linked.active=true;if(body.temporaryPassword){if(!validPassword(body.temporaryPassword))return json(res,400,{error:'Password must be at least 10 characters.'});linked.passwordHash=hashPassword(body.temporaryPassword)}}else{if(!validPassword(body.temporaryPassword))return json(res,400,{error:'Set a temporary password of at least 10 characters.'});linked={id:crypto.randomUUID(),name:member.name,email,role:body.accessRole||'member',memberId:member.id,active:true,passwordHash:hashPassword(body.temporaryPassword),createdAt:new Date().toISOString(),lastLogin:null};users.push(linked)}}else if(linked)linked.active=false;writeUsers(users);writeCollection(membersFile,members);return json(res,200,{member,user:linked?publicUser(linked):null});
  }
  if(pathname==='/api/my-profile'&&req.method==='GET'){
    if(!user.memberId)return json(res,400,{error:'Your account is not linked to a member record.'});
    const member=readCollection(membersFile).find(m=>String(m.id)===String(user.memberId));
    if(!member)return json(res,404,{error:'Your member record could not be found.'});
    return json(res,200,{member});
  }
  if(pathname==='/api/my-profile'&&req.method==='PATCH'){
    if(!user.memberId)return json(res,400,{error:'Your account is not linked to a member record.'});
    const body=await readBody(req),members=readCollection(membersFile),index=members.findIndex(m=>String(m.id)===String(user.memberId));
    if(index<0)return json(res,404,{error:'Your member record could not be found.'});
    const textFields=['personalEmail','mobilePhone','homePhone','address','nextOfKinName','nextOfKinRelationship','nextOfKinPhone','emergencyNotes','deployment'];
    for(const field of textFields)if(body[field]!==undefined)members[index][field]=String(body[field]).trim().slice(0,field==='address'||field==='emergencyNotes'?1000:150);
    if(members[index].personalEmail&&!validEmail(members[index].personalEmail))return json(res,400,{error:'Enter a valid personal email address.'});
    for(const field of ['ownVehicle','canWalkDistance','canCarryEquipment','accessiblePlacement'])if(body[field]!==undefined)members[index][field]=body[field]===true;
    members[index].email=members[index].raynetEmail||members[index].personalEmail||'';members[index].phone=members[index].mobilePhone||members[index].homePhone||'';members[index].profileUpdatedAt=new Date().toISOString();writeCollection(membersFile,members);return json(res,200,{member:members[index]});
  }
  if(pathname==='/api/my-events'&&req.method==='GET'){const responses=readCollection(responsesFile).filter(r=>String(r.memberId)===String(user.memberId));return json(res,200,{responses});}
  const eventResponsesMatch=pathname.match(/^\/api\/events\/([^/]+)\/responses$/);
  if(eventResponsesMatch&&req.method==='GET'){if(!['admin','coordinator','viewer'].includes(user.role))return json(res,403,{error:'Staff access required.'});const members=readCollection(membersFile),responses=readCollection(responsesFile).filter(item=>String(item.eventId)===eventResponsesMatch[1]).map(response=>{const member=members.find(item=>String(item.id)===String(response.memberId));return {...response,memberName:member?.name||'Unknown member',call:member?.call||'',mobilePhone:member?.mobilePhone||member?.phone||''}});return json(res,200,{responses});}
  if(pathname==='/api/my-events'&&req.method==='POST'){if(!user.memberId)return json(res,400,{error:'Your account is not linked to a member record.'});const body=await readBody(req),responses=readCollection(responsesFile),existing=responses.find(r=>String(r.memberId)===String(user.memberId)&&String(r.eventId)===String(body.eventId));if(existing){existing.response=body.response;existing.updatedAt=new Date().toISOString()}else responses.push({id:crypto.randomUUID(),memberId:user.memberId,eventId:String(body.eventId),response:body.response,updatedAt:new Date().toISOString()});writeCollection(responsesFile,responses);return json(res,200,{ok:true});}
  return json(res,404,{error:'Not found.'});
}

const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,`http://localhost:${port}`).pathname);
    if(pathname.startsWith('/api/'))return await api(req,res,pathname);
    const requested=pathname==='/'?'index.html':pathname.replace(/^\//,'');
    if(requested.startsWith('data/')||requested.includes('..')){res.writeHead(403);return res.end('Forbidden');}
    const file=path.join(root,requested);fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};if(appUrl.protocol==='https:')headers['Strict-Transport-Security']='max-age=31536000; includeSubDomains';res.writeHead(200,headers);res.end(data);});
  }catch(error){console.error(error);json(res,500,{error:'The server could not complete that request.'});}
});
async function start(){await initialiseStorage();server.listen(port,host,()=>console.log(`RAYNET CRM running on ${host}:${port}; public URL ${appUrl.origin}; storage ${storageDriver}`));setInterval(()=>processRenewalAutomation().catch(error=>console.error('Renewal automation:',error.message)),60*60*1000)}
async function shutdown(){server.close();await mysqlWriteQueue;if(mysqlPool)await mysqlPool.end();process.exit(0)}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
start().catch(error=>{console.error('Startup failed:',error.message);process.exit(1)});
