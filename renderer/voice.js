// Hidden page that owns the microphone and the live audio connection to OpenAI Realtime.
// States shown on the board: connecting, listening, thinking, speaking, off.
const IDLE_STOP_MS = 120000; // hang up after two quiet minutes so nothing keeps running (and billing)

let pc = null, dc = null, stream = null, audioEl = null, idleTimer = null, lastActivity = 0;

const send = (obj) => { if (dc && dc.readyState === 'open') dc.send(JSON.stringify(obj)); };
const state = (s, text) => window.voice.state(s, text || '');
const touch = () => { lastActivity = Date.now(); };

async function start() {
  if (pc) return;
  state('connecting');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    pc = new RTCPeerConnection();
    audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    dc = pc.createDataChannel('oai-events');
    dc.onmessage = (m) => onEvent(JSON.parse(m.data));
    dc.onopen = () => {
      touch(); state('listening'); // no spoken greeting: you can start talking straight away
    };
    pc.onconnectionstatechange = () => { if (['failed', 'closed', 'disconnected'].includes(pc && pc.connectionState)) stop(); };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const answer = await window.voice.offer(offer.sdp);
    await pc.setRemoteDescription({ type: 'answer', sdp: answer });

    touch();
    idleTimer = setInterval(() => { if (Date.now() - lastActivity > IDLE_STOP_MS) stop(); }, 10000);
  } catch (e) {
    window.voice.log('start failed: ' + (e && e.message ? e.message : e));
    stop('error');
  }
}

function stop(why) {
  clearInterval(idleTimer); idleTimer = null;
  try { dc && dc.close(); } catch {}
  try { pc && pc.close(); } catch {}
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (audioEl) audioEl.srcObject = null;
  pc = dc = stream = audioEl = null;
  state(why === 'error' ? 'error' : 'off');
}

async function onEvent(e) {
  switch (e.type) {
    case 'input_audio_buffer.speech_started': touch(); state('listening'); break;
    case 'input_audio_buffer.speech_stopped': touch(); state('thinking'); break;
    case 'output_audio_buffer.started': touch(); state('speaking'); break;
    case 'output_audio_buffer.stopped': case 'output_audio_buffer.cleared': state('listening'); break;
    case 'conversation.item.input_audio_transcription.completed': window.voice.log('you: ' + e.transcript); break;
    case 'response.output_audio_transcript.done': window.voice.log('board: ' + e.transcript); break;
    case 'error': window.voice.log('error event: ' + JSON.stringify(e.error)); break;
    case 'response.done': {
      touch();
      // Run any tools the voice asked for, hand back the results, and let it carry on talking
      const calls = ((e.response && e.response.output) || []).filter((i) => i.type === 'function_call');
      if (!calls.length) break;
      state('thinking');
      for (const c of calls) {
        let args = {};
        try { args = JSON.parse(c.arguments || '{}'); } catch {}
        const out = await window.voice.tool(c.name, args);
        send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(out) } });
      }
      send({ type: 'response.create' });
      break;
    }
  }
}

window.voice.onCmd((c) => {
  if (c === 'toggle') return pc ? stop() : start();
  if (c && c.type === 'agent' && dc && dc.readyState === 'open') { // the computer task finished: tell the model, which tells the user
    touch();
    send({ type: 'conversation.item.create', item: { type: 'message', role: 'system', content: [{ type: 'input_text', text: '[Computer task finished] ' + c.text }] } });
    send({ type: 'response.create' });
  }
});
