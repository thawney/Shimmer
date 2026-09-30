const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a); return source.slice(a,b);
}
function fixture() {
  const input = {name:'Shimmer',state:'connected',onmidimessage:null};
  const output = {name:'Shimmer',state:'connected'};
  const ctx = {
    midiIn:input,midiOut:output,selPort:{value:'Shimmer'},
    midiAccess:{inputs:new Map([['in',input]]),outputs:new Map([['out',output]])},
    _portEpoch:1,_rxInSysEx:false,_rxBuf:[],_pendingAck:null,_fwAckWaiter:null,
    _fwAckQueue:[],_dlTimer:null,_dlReject:null,_dlResolve:null,_dlSlot:-1,_dlBuf:[],
    _dlExpectedLen:0,_slotNamesSeenMask:0,_startupSyncTimer:null,_startupSyncInFlight:false,
    _scriptTransferDepth:0,_scriptTransferChain:Promise.resolve(),
    NUM_SLOTS:4,CMD_GET:1,CMD_GET_SLOT_NAMES:0x25,VER:1,
    setTimeout,clearTimeout,Date,Promise,Error,Uint8Array,
    setStatus(){},setBootState(){},setSynced(){},renderClockInfo(){},setSlotStatus(){},
    sends:[],downloads:[],frames:[],
    send(bytes){ctx.sends.push([...bytes]);if(bytes[0]===0x25)ctx._slotNamesSeenMask=15;},
    async queueDownloadScript(slot){ctx.downloads.push(slot);return true;},
    handleSysExFrame(frame){ctx.frames.push([...frame]);},
  };
  vm.createContext(ctx);
  for (const [a,b] of [
    ['function _normPort(', 'function scheduleStartupSync('],
    ['function scheduleStartupSync(', 'function bindPorts('],
    ['function bindPorts(', "selPort.addEventListener('change'"],
    ['async function runStartupSync(', 'function sendModeEnabled('],
    ['function queueScriptTransfer(', 'function clearActiveDownload('],
    ['function clearActiveDownload(', 'function waitAck('],
    ['function onMidiMessage(', 'function parseGlobalSettings('],
  ]) vm.runInContext(section(a,b),ctx);
  return ctx;
}
(async()=>{
  let c=fixture();let rejected=0;
  c._dlReject=()=>{++rejected;};c._dlSlot=2;
  c._pendingAck={timer:null,reject(){++rejected;}};
  // WebMIDI opening a port and Refresh both keep the same port objects.
  c.bindPorts();c.bindPorts();
  assert.equal(c._portEpoch,1);assert.equal(rejected,0);assert.equal(c._dlSlot,2);
  assert(c._pendingAck);assert.equal(c._startupSyncTimer,null);
  // A real disconnect must settle the request, not erase its callbacks.
  c.midiIn.state='disconnected';c.bindPorts();
  assert.equal(rejected,2);assert.equal(c._dlSlot,-1);assert.equal(c.midiIn,null);
  assert.equal(c._portEpoch,2);
  c=fixture();let release;
  c._scriptTransferChain=new Promise(resolve=>release=resolve);
  let runs=0;const queued=c.queueScriptTransfer(0,'Download',()=>{++runs;return true;});
  ++c._portEpoch;release();assert.equal(await queued,false);assert.equal(runs,0);
  assert.equal(c._scriptTransferDepth,0);
  c=fixture();c.onMidiMessage({data:Uint8Array.from([0xf0,0x7d,0x29,1,0xf8,0,0,0xfa,1,2,0xf7])});
  assert.deepEqual(c.frames[0],[0xf0,0x7d,0x29,1,0,0,1,2,0xf7]);
  c=fixture();const start=Date.now();await c.runStartupSync(false);
  assert.deepEqual(c.sends,[[1,1],[0x25,1]]);assert.deepEqual(c.downloads,[0,1,2,3]);
  assert.equal(c._startupSyncInFlight,false);assert(Date.now()-start<300);
  console.log('MIDI sync: opening/refresh events preserve reads; disconnect rejects; stale queue cancels; realtime filtering and startup passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
