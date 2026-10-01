const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(()=>resolve(port))})})}
function waitForServer(child){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('CRM did not start')),10000);child.stdout.on('data',chunk=>{if(String(chunk).includes('RAYNET CRM running')){clearTimeout(timer);resolve()}});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`CRM exited with code ${code}`))})})}

test('serves the application and API beneath APP_URL path',async t=>{
  const port=await freePort(),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'raynet-crm-subpath-'));
  const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',APP_URL:`http://127.0.0.1:${port}/members/`,RAYNET_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();fs.rmSync(dataDir,{recursive:true,force:true})});
  await waitForServer(child);
  const root=await fetch(`http://127.0.0.1:${port}/members/`),script=await fetch(`http://127.0.0.1:${port}/members/app.js`),api=await fetch(`http://127.0.0.1:${port}/members/api/auth/status`),redirect=await fetch(`http://127.0.0.1:${port}/members`,{redirect:'manual'});
  assert.equal(root.status,200);
  assert.match(await root.text(),/href="styles\.css/);
  assert.equal(script.status,200);
  assert.match(await script.text(),/crmBaseUrl/);
  assert.equal(api.status,200);
  assert.equal(redirect.status,308);
  assert.equal(redirect.headers.get('location'),'/members/');
});
