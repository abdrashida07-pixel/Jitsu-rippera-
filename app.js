const state = { resolution: "480p", video: null, refs: [], requestId: null, timer: null };
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const videoInput = $("#videoInput"), imageInput = $("#imageInput"), videoDrop = $("#videoDrop");
const videoPreview = $("#videoPreview"), videoEl = videoPreview.querySelector("video"), videoMeta = $("#videoMeta");
const thumbs = $("#thumbs"), prompt = $("#prompt"), generateBtn = $("#generateBtn"), cancelBtn = $("#cancelBtn");
const resultEmpty = $("#resultEmpty"), resultLoading = $("#resultLoading"), resultVideo = $("#resultVideo");
const outputVideo = $("#outputVideo"), errorBox = $("#error");
function showError(message){ errorBox.textContent=message; errorBox.classList.remove("hidden"); }
function clearError(){ errorBox.classList.add("hidden"); errorBox.textContent=""; }
function setBusy(b){ generateBtn.disabled=b; cancelBtn.classList.toggle("hidden",!b); }
function formatBytes(n){ return n<1024*1024?`${Math.round(n/1024)} KB`:`${(n/1024/1024).toFixed(1)} MB`; }
function updateUI(){ $("#title").textContent="Motion Transfer"; $("#description").textContent="Transfer the movement of your source video to the reference character using an open video model."; $("#modelName").textContent="Wan 2.2 Animate"; $("#modelNote").textContent="Free GPU mode: short clips, limited daily quota."; $$(".mode").forEach(b=>b.classList.toggle("active",b.dataset.mode==="motion")); }
async function checkApi(){ try{const r=await fetch("/api/health"),d=await r.json(); $("#apiDot").classList.toggle("ok",d.configured); $("#apiDot").classList.toggle("bad",!d.configured); $("#apiStatus").textContent=d.configured?"Free AI ready":"HF Space not configured";}catch{$("#apiDot").classList.add("bad");$("#apiStatus").textContent="Server offline";} }
videoInput.addEventListener("change",()=>{const f=videoInput.files?.[0];if(f)setVideo(f);});
function setVideo(f){clearError();state.video=f;videoEl.src=URL.createObjectURL(f);videoPreview.classList.remove("hidden");videoDrop.classList.add("hidden");$("#videoCounter").textContent="1 / 1";videoMeta.textContent=`${f.name} · ${formatBytes(f.size)}`;}
$("#removeVideo").addEventListener("click",()=>{state.video=null;videoEl.removeAttribute("src");videoPreview.classList.add("hidden");videoDrop.classList.remove("hidden");videoInput.value="";$("#videoCounter").textContent="0 / 1";});
imageInput.addEventListener("change",()=>{for(const f of [...imageInput.files]){if(state.refs.length>=1)break;state.refs.push(f);}imageInput.value="";renderRefs();});
function renderRefs(){thumbs.innerHTML="";state.refs.forEach((f,i)=>{const w=document.createElement("div");w.className="thumb";const img=document.createElement("img");img.src=URL.createObjectURL(f);const b=document.createElement("button");b.textContent="×";b.onclick=()=>{state.refs.splice(i,1);renderRefs();};w.append(img,b);thumbs.appendChild(w);});$("#refCount").textContent=state.refs.length;}
$$('[data-res]').forEach(b=>b.addEventListener("click",()=>{state.resolution=b.dataset.res;$$('[data-res]').forEach(x=>x.classList.toggle("active",x===b));}));
prompt.addEventListener("input",()=>$("#charCount").textContent=`${prompt.value.length.toLocaleString()} / 4,000`);
$$('.prompt-suggestions button').forEach(b=>b.addEventListener("click",()=>{prompt.value=prompt.value?`${prompt.value}\n${b.dataset.prompt}`:b.dataset.prompt;prompt.dispatchEvent(new Event("input"));}));
["dragenter","dragover"].forEach(t=>videoDrop.addEventListener(t,e=>{e.preventDefault();videoDrop.style.borderColor="#777";}));
["dragleave","drop"].forEach(t=>videoDrop.addEventListener(t,e=>{e.preventDefault();videoDrop.style.borderColor="";}));
videoDrop.addEventListener("drop",e=>{const f=[...e.dataTransfer.files].find(x=>x.type.startsWith("video/"));if(f)setVideo(f);});
async function generate(){clearError();if(!state.video)return showError("Add a source video first.");if(!state.refs.length)return showError("Add one reference image.");setBusy(true);resultEmpty.classList.add("hidden");resultVideo.classList.add("hidden");resultLoading.classList.remove("hidden");$("#resultStatus").textContent="Uploading";$("#loadingText").textContent="Uploading video and reference…";try{const fd=new FormData();fd.append("video",state.video);fd.append("reference",state.refs[0]);fd.append("prompt",prompt.value||"The person is moving naturally, preserve the original motion and camera movement.");const r=await fetch("/api/generate",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||`Generation request failed (${r.status})`);state.requestId=d.request_id;$("#resultStatus").textContent="Queued";$("#loadingText").textContent="AI is generating your video…";$("#loadingSub").textContent="The free GPU may take a few minutes.";poll();}catch(e){finishError(e.message);}}
async function poll(){if(!state.requestId)return;try{const r=await fetch(`/api/status/${encodeURIComponent(state.requestId)}`),d=await r.json();if(!r.ok)throw new Error(d.error||"Status request failed");$("#resultStatus").textContent=(d.status||"processing").replaceAll("_"," ");if(d.progress!=null)$("#loadingSub").textContent=`Generating… ${Math.round(d.progress*100)}%`;if(d.status==="completed"&&d.videoUrl)return finish(d.videoUrl);if(d.status==="failed")throw new Error(d.error||"Generation failed");state.timer=setTimeout(poll,2500);}catch(e){finishError(e.message);}}
function finish(url){clearTimeout(state.timer);setBusy(false);state.requestId=null;resultLoading.classList.add("hidden");resultVideo.classList.remove("hidden");$("#resultStatus").textContent="Completed";outputVideo.src=url;$("#downloadBtn").href=url;}
function finishError(m){clearTimeout(state.timer);setBusy(false);state.requestId=null;resultLoading.classList.add("hidden");resultEmpty.classList.remove("hidden");$("#resultStatus").textContent="Error";showError(m);}
generateBtn.addEventListener("click",generate);cancelBtn.addEventListener("click",()=>{clearTimeout(state.timer);finishError("Generation polling canceled. The GPU job may continue on Hugging Face.");});
updateUI();checkApi();
