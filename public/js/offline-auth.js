// Local offline identity only. Never stores plaintext passwords or Supabase tokens.
(function(){
"use strict";
if(window.__BC_OFFLINE_AUTH_HELPER__)return;
window.__BC_OFFLINE_AUTH_HELPER__=true;
window.__BC_OFFLINE_AUTH__=window.__BC_OFFLINE_AUTH__===true;
var DB="battlecruiser-cache",VERSION=3,STORE="lecturas",ITERATIONS=210000,MAX_AGE=30*24*60*60*1000,LAST="__bc_offline_last_user_v1";
function norm(v){return String(v||"").trim().toLocaleLowerCase("en-US");}
function dbOpen(){
 if(typeof idbAbrir==="function")return idbAbrir();
 return new Promise(function(resolve,reject){
  var r=indexedDB.open(DB,VERSION);
  r.onsuccess=function(){resolve(r.result);};r.onerror=function(){reject(r.error);};
  r.onupgradeneeded=function(){
   var d=r.result;
   if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"clave"});
   if(!d.objectStoreNames.contains("operaciones_pendientes")){
    var s=d.createObjectStore("operaciones_pendientes",{keyPath:"id"});
    s.createIndex("estado","estado",{unique:false});s.createIndex("creado_en","creado_en",{unique:false});s.createIndex("usuario_id","usuario_id",{unique:false});
   }
  };
 });
}
async function read(k){var d=await dbOpen();return await new Promise(function(resolve,reject){var t=d.transaction(STORE,"readonly"),r=t.objectStore(STORE).get(k);r.onsuccess=function(){resolve(r.result?r.result.datos:null);};r.onerror=function(){reject(r.error);};});}
async function write(k,v){var d=await dbOpen();await new Promise(function(resolve,reject){var t=d.transaction(STORE,"readwrite");t.objectStore(STORE).put({clave:k,datos:v,actualizado:new Date().toISOString()});t.oncomplete=resolve;t.onerror=function(){reject(t.error);};t.onabort=function(){reject(t.error||new Error("IndexedDB abort"));};});return true;}
async function remove(k){var d=await dbOpen();await new Promise(function(resolve,reject){var t=d.transaction(STORE,"readwrite");t.objectStore(STORE).delete(k);t.oncomplete=resolve;t.onerror=function(){reject(t.error);};});}
function b64(a){var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s);}
function un64(s){var v=atob(String(s||"")),a=new Uint8Array(v.length);for(var i=0;i<v.length;i++)a[i]=v.charCodeAt(i);return a;}
async function derive(pass,salt){
 if(!crypto||!crypto.subtle)throw new Error("No hay verificador criptográfico seguro disponible.");
 var key=await crypto.subtle.importKey("raw",new TextEncoder().encode(String(pass)),"PBKDF2",false,["deriveBits"]);
 return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:salt,iterations:ITERATIONS,hash:"SHA-256"},key,256));
}
function equal(a,b){if(!a||!b||a.length!==b.length)return false;var x=0;for(var i=0;i<a.length;i++)x|=a[i]^b[i];return x===0;}
function fresh(r){var d=Date.parse(r&&r.updatedAt||"");return Number.isFinite(d)&&d<=Date.now()&&Date.now()-d<=MAX_AGE;}
function msg(s){var n=document.getElementById("login-error");if(n)n.textContent=s;}
function bannerMsg(s){var n=document.querySelector("#bc-offline-auth-banner [data-bc-offline-status]");if(n)n.textContent=s;}
function removeBanner(){var n=document.getElementById("bc-offline-auth-banner");if(n)n.remove();}
function banner(){
 var shell=document.getElementById("app-shell");if(!shell)return;
 var n=document.getElementById("bc-offline-auth-banner");
 if(!n){
  n=document.createElement("aside");n.id="bc-offline-auth-banner";n.setAttribute("role","status");
  n.style.cssText="margin:10px 12px;padding:11px 13px;border:1px solid #c9a24d;border-radius:8px;background:#3a301b;color:#ffedc5;font:600 12px/1.45 Inter,system-ui,sans-serif;";
  n.innerHTML="<strong>MODO LOCAL · SINCRONIZACIÓN PAUSADA</strong><p style='margin:5px 0 9px;font-weight:400'>Las lecturas muestran la última copia guardada. Las operaciones nuevas quedan pendientes en este dispositivo y no cambian la base, el stock ni la caja hasta validar sesión y sincronización.</p><p data-bc-offline-status style='margin:0 0 9px;font-weight:400'></p><div style='display:flex;flex-wrap:wrap;gap:7px'><button type='button' data-reconnect style='border:1px solid #c9a24d;border-radius:6px;padding:7px 10px;background:#c9a24d;color:#171711;font-weight:700'>Validar sesión y sincronizar</button><button type='button' data-online-login style='border:1px solid #a9915c;border-radius:6px;padding:7px 10px;background:transparent;color:#ffedc5'>Entrar online</button></div>";
  shell.insertBefore(n,shell.firstChild);
  n.querySelector("[data-reconnect]").addEventListener("click",function(){window.bcOfflineTryReconnect(true).catch(function(){});});
  n.querySelector("[data-online-login]").addEventListener("click",function(){window.bcOfflineShowOnlineLogin();});
 }
 bannerMsg(navigator.onLine?"Hay conexión de red; falta validar tu sesión con el servidor.":"Sin internet. Puedes seguir registrando operaciones localmente.");
}
window.bcOfflineSaveContext=async function(snap){
 if(!snap||!snap.userId||!snap.usuario||!snap.efectivos||snap.exitosa!==true)return false;
 try{await write("__bc_offline_context_v1::"+String(snap.userId),Object.assign({},snap,{updatedAt:new Date().toISOString()}));return true;}
 catch(e){console.warn("[BattleCruiser] No se pudo persistir el perfil offline:",e);return false;}
};
window.bcOfflineLoadContext=async function(uid){
 if(!uid)return null;
 try{var v=await read("__bc_offline_context_v1::"+String(uid));return v&&v.exitosa===true&&String(v.userId)===String(uid)&&fresh(v)?v:null;}
 catch(e){console.warn("[BattleCruiser] No se pudo recuperar el perfil offline:",e);return null;}
};
window.bcOfflineRememberCredentials=async function(identifier,password,uid){
 var username=norm(identifier);if(!username||!password||!uid||String(password).length>256)return false;
 var salt=crypto.getRandomValues(new Uint8Array(16)),verifier=await derive(password,salt);
 await write("__bc_offline_credential_v1::"+username,{username:username,userId:String(uid),salt:b64(salt),verifier:b64(verifier),iterations:ITERATIONS,updatedAt:new Date().toISOString()});
 await write(LAST,{userId:String(uid),username:username,updatedAt:new Date().toISOString()});return true;
};
window.bcOfflineClearLastUser=async function(){try{await remove(LAST);}catch(_){}};
window.bcOfflineLogin=async function(identifier,password){
 var username=norm(identifier);if(!username||!password)return false;
 try{
  var c=await read("__bc_offline_credential_v1::"+username);
  if(!c||!c.userId||c.iterations!==ITERATIONS){msg("Este usuario no está preparado para acceso offline en este dispositivo. Entra una vez online para habilitarlo.");return false;}
  var context=await window.bcOfflineLoadContext(c.userId);
  if(!context){msg("El perfil offline expiró o no está disponible. Entra online para renovarlo.");return false;}
  if(!equal(await derive(password,un64(c.salt)),un64(c.verifier))){msg("Usuario o contraseña incorrectos para este dispositivo.");return false;}
  await write(LAST,{userId:c.userId,username:username,updatedAt:new Date().toISOString()});
  window.__BC_OFFLINE_AUTH__=true;window.__BC_OFFLINE_AUTH_USER_ID__=String(c.userId);window.__BC_OFFLINE_EXPLICIT_LOGOUT__=false;
  if(typeof showApp!=="function")return false;
  showApp({user:{id:String(c.userId)},bcOffline:true});banner();
  var p=document.getElementById("password");if(p)p.value="";
  return true;
 }catch(e){console.warn("[BattleCruiser] Falló el acceso local:",e);msg("No se pudo recuperar el acceso offline. La contraseña no se guardó.");return false;}
};
window.bcOfflineRestoreLastUser=async function(){
 if(window.__BC_OFFLINE_AUTH__||!window.__BC_UI_READY_RESOLVED__)return false;
 if(typeof _bcRecoveryMode!=="undefined"&&_bcRecoveryMode)return false;
 var a=window.__BC_AUTH_DIAGNOSTIC__||{},p=window.__BC_BACKEND_PROBE__||{};
 if(navigator.onLine&&a.cause!=="NETWORK_ERROR"&&a.cause!=="LOCK_TIMEOUT"&&p.status!=="offline"&&p.status!=="error")return false;
 try{
  var last=await read(LAST);if(!last||!last.userId||!(await window.bcOfflineLoadContext(last.userId)))return false;
  window.__BC_OFFLINE_AUTH__=true;window.__BC_OFFLINE_AUTH_USER_ID__=String(last.userId);window.__BC_OFFLINE_EXPLICIT_LOGOUT__=false;
  if(typeof showApp!=="function")return false;showApp({user:{id:String(last.userId)},bcOffline:true});banner();return true;
 }catch(e){console.warn("[BattleCruiser] No se pudo restaurar el último perfil:",e);return false;}
};
window.bcOfflineShowOnlineLogin=function(){
 if(window.__BC_OFFLINE_AUTH__!==true)return false;
 window.__BC_OFFLINE_AUTH__=false;window.__BC_OFFLINE_AUTH_USER_ID__=null;removeBanner();
 if(typeof showLogin==="function")showLogin();msg("Entra online para validar tu identidad y sincronizar las operaciones pendientes.");return true;
};
window.bcOfflineTryReconnect=async function(interactive){
 if(window.__BC_OFFLINE_AUTH__!==true)return false;
 if(!navigator.onLine){bannerMsg("Todavía no hay conexión. Las operaciones siguen guardadas localmente.");return false;}
 try{
  var pack=await client.auth.getSession(),session=pack&&pack.data&&pack.data.session;
  if(!session||!session.user||String(session.user.id)!==String(window.__BC_OFFLINE_AUTH_USER_ID__)){if(interactive)window.bcOfflineShowOnlineLogin();else bannerMsg("Internet disponible. Entra online para validar tu identidad y sincronizar.");return false;}
  var verified=await client.auth.getUser(),user=verified&&verified.data&&verified.data.user;
  if(!user||verified.error||String(user.id)!==String(session.user.id)){if(interactive)window.bcOfflineShowOnlineLogin();else bannerMsg("La sesión necesita validación. Entra online.");return false;}
  window.__BC_OFFLINE_AUTH__=false;window.__BC_OFFLINE_AUTH_USER_ID__=null;removeBanner();
  if(typeof cargarContextoUsuario==="function")await cargarContextoUsuario(session);
  if(typeof sincronizarCola==="function")await sincronizarCola();return true;
 }catch(e){console.warn("[BattleCruiser] No se pudo revalidar la sesión online:",e);if(interactive)window.bcOfflineShowOnlineLogin();else bannerMsg("Internet disponible; la sesión aún no se pudo validar. Pulsa «Validar sesión y sincronizar».");return false;}
};
var logout=document.getElementById("logout-btn");
if(logout)logout.addEventListener("click",function(){window.__BC_OFFLINE_EXPLICIT_LOGOUT__=true;window.bcOfflineClearLastUser();},true);
if(typeof client!=="undefined"&&client.auth&&typeof client.auth.onAuthStateChange==="function"){
 client.auth.onAuthStateChange(function(event,session){
  if(event==="SIGNED_IN"&&session&&session.user){
   window.__BC_OFFLINE_AUTH__=false;window.__BC_OFFLINE_AUTH_USER_ID__=null;window.__BC_OFFLINE_EXPLICIT_LOGOUT__=false;removeBanner();
   setTimeout(function(){if(typeof sincronizarCola==="function")sincronizarCola().catch(function(){});},250);
  }
  if(event==="SIGNED_OUT"){window.__BC_OFFLINE_AUTH__=false;window.__BC_OFFLINE_AUTH_USER_ID__=null;window.__BC_OFFLINE_EXPLICIT_LOGOUT__=false;removeBanner();}
 });
}
window.addEventListener("online",function(){if(window.__BC_OFFLINE_AUTH__===true)window.bcOfflineTryReconnect(false).catch(function(){});});
window.addEventListener("offline",function(){if(window.__BC_OFFLINE_AUTH__===true)bannerMsg("Sin internet. La cola permanece guardada y sin enviar.");});
window.addEventListener("bc:ui-ready",function(){window.bcOfflineRestoreLastUser().catch(function(){});});
window.addEventListener("bc:auth-diagnostic",function(){window.bcOfflineRestoreLastUser().catch(function(){});});
if(window.__BC_UI_READY_RESOLVED__)window.bcOfflineRestoreLastUser().catch(function(){});
})();