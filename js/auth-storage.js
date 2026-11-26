"use strict";
(function(){
  // Supabase session storage for the installed iOS web app.
  // Cookies persist in Home Screen apps and can be copied from Safari once
  // when the app is first added to the Home Screen (iOS 17.2+).
  const CHUNK_SIZE=2800,MAX_CHUNKS=16,COOKIE_MAX_AGE=31536000;
  const secure=window.location?.protocol==="https:";
  const cookieOptions="; Path=/; Max-Age="+COOKIE_MAX_AGE+"; SameSite=Lax"+(secure?"; Secure":"");
  function readCookie(name){
    try{
      const prefix=name+"=";
      const entry=String(document.cookie||"").split(/;\s*/).find(part=>part.startsWith(prefix));
      return entry?entry.slice(prefix.length):null;
    }catch(_){return null;}
  }
  function writeCookie(name,value){
    document.cookie=name+"="+value+cookieOptions;
    if(readCookie(name)!==value)throw new Error("Persistent auth cookie could not be verified.");
  }
  function deleteCookie(name){
    try{document.cookie=name+"=; Path=/; Max-Age=0; SameSite=Lax"+(secure?"; Secure":"");}catch(_){}
  }
  function readCookieSession(key){
    const count=Number(readCookie(key+".chunks"));
    if(!Number.isInteger(count)||count<1||count>MAX_CHUNKS)return null;
    let encoded="";
    for(let index=0;index<count;index++){
      const part=readCookie(key+".part."+index);
      if(part===null)return null;
      encoded+=part;
    }
    try{return decodeURIComponent(encoded);}catch(_){return null;}
  }
  function clearCookieSession(key){
    deleteCookie(key+".chunks");
    for(let index=0;index<MAX_CHUNKS;index++)deleteCookie(key+".part."+index);
  }
  function writeCookieSession(key,value){
    const encoded=encodeURIComponent(String(value));
    const count=Math.max(1,Math.ceil(encoded.length/CHUNK_SIZE));
    if(count>MAX_CHUNKS)throw new Error("Supabase session is too large for persistent cookie storage.");
    for(let index=0;index<count;index++)writeCookie(key+".part."+index,encoded.slice(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE));
    writeCookie(key+".chunks",String(count));
    for(let index=count;index<MAX_CHUNKS;index++)deleteCookie(key+".part."+index);
    if(readCookieSession(key)!==String(value))throw new Error("Persistent auth cookie verification failed.");
  }
  function readLegacyStorage(key){try{return window.localStorage.getItem(key);}catch(_){return null;}}
  function writeLegacyStorage(key,value){try{window.localStorage.setItem(key,value);return true;}catch(_){return false;}}
  const storage={
    async getItem(key){
      const cookieValue=readCookieSession(key);
      if(cookieValue!==null){writeLegacyStorage(key,cookieValue);return cookieValue;}
      const legacyValue=readLegacyStorage(key);
      if(legacyValue!==null){
        try{writeCookieSession(key,legacyValue);}catch(error){console.warn("HAN auth cookie migration:",error);}
        return legacyValue;
      }
      return null;
    },
    async setItem(key,value){
      const raw=String(value);let cookieSaved=false;
      try{writeCookieSession(key,raw);cookieSaved=true;}
      catch(error){clearCookieSession(key);console.warn("HAN persistent auth cookie storage unavailable; using localStorage fallback:",error);}
      const localSaved=writeLegacyStorage(key,raw);
      if(!cookieSaved&&!localSaved)throw new Error("The sign-in session could not be saved on this device.");
    },
    async removeItem(key){clearCookieSession(key);try{window.localStorage.removeItem(key);}catch(_){}},
    async requestPersistence(){
      try{
        const manager=navigator.storage;
        if(!manager?.persisted||!manager?.persist)return false;
        if(await manager.persisted())return true;
        return await manager.persist();
      }catch(error){console.warn("HAN persistent storage request:",error);return false;}
    }
  };
  window.FarnazAuthStorage=storage;
})();
