'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function setup(){
 const events={},elements=new Map([['#saveStatus',{}],['#content',{innerHTML:''}]]),initial={selectedApp:'a',bases:[],signatures:[],apps:[{id:'a',selectedDevice:'mobile',selectedOS:'android',profiles:{mobile:{android:{baseId:'base'}}},advanced:{scheme:'',host:'',channel:'default',statisticsKey:'legacy',privacyUrl:'https://old.example'}}]};
 const saved=[],api={state:()=>new Promise(()=>{}),onEvent(){},save:async app=>{saved.push(structuredClone(app));return { ...initial,apps:[structuredClone(app)]};}};
 const context=vm.createContext({window:{packer:api},document:{querySelector:s=>elements.get(s)||null,addEventListener:(n,cb)=>events[n]=cb},setTimeout:()=>0,clearTimeout(){},initial,structuredClone});
 const run=s=>vm.runInContext(s,context);run(fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8'));run('state=structuredClone(initial);renderWorkbench=()=>{}');return {run,events,elements,saved};
}
test('底部输入事件保存 Scheme、Host 和渠道，重绘后可恢复，清理旧统计保留这些配置',async()=>{
 const f=setup();for(const [key,value]of Object.entries({scheme:'hetun',host:'open',channel:'website'}))f.events.input({target:{dataset:{path:'advanced.'+key},type:'text',value}});
 assert.equal(f.elements.get('#saveStatus').textContent,'待保存');await f.run('save()');assert.equal(f.saved[0].advanced.channel,'website');assert.equal(f.saved[0].advanced.scheme,'hetun');assert.equal(f.saved[0].advanced.host,'open');
 await f.run("action('clearUnsupported',{})");await f.run('save()');assert.equal(f.saved[1].advanced.statisticsKey,'');assert.equal(f.saved[1].advanced.privacyUrl,'');assert.equal(f.saved[1].advanced.scheme,'hetun');assert.equal(f.saved[1].advanced.host,'open');assert.equal(f.saved[1].advanced.channel,'website');assert.match(f.run('renderExtraSettings(app())'),/value="website"/);
});
test('底部根据实际底包显示能力提示，配置文本转义且统计没有假输入',()=>{
 const f=setup();assert.match(f.run('renderExtraSettings(app())'),/当前底包未接入网页唤起/);f.run("state.bases=[{id:'base',capabilities:['deep-link-v1','channel-header-v1']}];app().advanced.scheme='x<';app().advanced.host='open';app().advanced.channel='\" onfocus=\"oops'");
 const html=f.run('renderExtraSettings(app())');assert.match(html,/当前底包已接入网页唤起/);assert.match(html,/当前底包已接入渠道请求头/);assert.match(html,/x&lt;/);assert.doesNotMatch(html,/value="" onfocus=/);assert.doesNotMatch(html,/data-path="advanced\.(statisticsKey|privacyUrl)"/);
});
