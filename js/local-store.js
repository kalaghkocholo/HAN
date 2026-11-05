"use strict";
(function(){
  const DB_NAME="farnaz-local-v1";
  const DB_VERSION=2;
  const STORE_MESSAGES="chatMessages";
  const STORE_DRAFTS="drafts";
  const STORE_TEMP="tempFiles";
  const STORE_SNAPSHOTS="snapshots";
  const STORE_SPACE_MESSAGES="spaceMessages";
  let opening=null;
  // Serialize account-cache writes against logout cleanup. A quick re-login must
  // write fresh cache data only after the previous logout purge has completed.
  const clearingUsers=new Map();
  // Every account-scoped operation captures a generation. Logout advances it
  // synchronously, so an older async read/write cannot publish or persist data
  // after the purge starts, even if it was already waiting for IndexedDB.
  const userGenerations=new Map();
  function generationFor(userId){return userId?Number(userGenerations.get(String(userId))||0):0;}
  function generationIsCurrent(userId,generation){return !userId||generationFor(userId)===generation;}
  async function waitForUserClear(userId){
    if(!userId)return;
    while(clearingUsers.has(String(userId))){
      const pending=clearingUsers.get(String(userId));
      await pending;
    }
  }

  function openDB(){
    if(!("indexedDB" in window))return Promise.resolve(null);
    if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,db)=>{
        if(settled){if(db)db.close();return;}
        settled=true;clearTimeout(timer);
        if(error){opening=null;reject(error);return;}
        db.onversionchange=()=>{db.close();opening=null;};
        resolve(db);
      };
      const timer=setTimeout(()=>finish(new Error("Local storage open timed out")),3500);
      let request;
      try{request=indexedDB.open(DB_NAME,DB_VERSION);}
      catch(error){finish(error);return;}
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE_MESSAGES))db.createObjectStore(STORE_MESSAGES,{keyPath:"key"});
        if(!db.objectStoreNames.contains(STORE_DRAFTS))db.createObjectStore(STORE_DRAFTS,{keyPath:"key"});
        if(!db.objectStoreNames.contains(STORE_TEMP))db.createObjectStore(STORE_TEMP,{keyPath:"key"});
        if(!db.objectStoreNames.contains(STORE_SNAPSHOTS))db.createObjectStore(STORE_SNAPSHOTS,{keyPath:"key"});
        if(!db.objectStoreNames.contains(STORE_SPACE_MESSAGES))db.createObjectStore(STORE_SPACE_MESSAGES,{keyPath:"key"});
      };
      request.onsuccess=()=>finish(null,request.result);
      request.onerror=()=>finish(request.error||new Error("Local storage unavailable"));
      request.onblocked=()=>finish(new Error("Local storage upgrade is blocked"));
    });
    return opening;
  }

  function keyFor(userId,contactId){return String(userId)+"::"+String(contactId);}
  async function read(storeName,key,userId=null){
    // Bind this read to the account generation at invocation time. If logout
    // starts while we await a gate or IndexedDB, discard the late result.
    const generation=generationFor(userId);
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return null;
    const db=await openDB();if(!db)return null;
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return null;
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,value)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        if(error)reject(error);else resolve(value||null);
      };
      const timer=setTimeout(()=>finish(new Error("Local read timed out")),2500);
      let tx,request;
      try{tx=db.transaction(storeName,"readonly");request=tx.objectStore(storeName).get(key);}
      catch(error){finish(error);return;}
      request.onsuccess=()=>finish(null,generationIsCurrent(userId,generation)?(request.result||null):null);
      request.onerror=()=>finish(request.error||new Error("Local read failed"));
      tx.onerror=()=>finish(tx.error||new Error("Local read transaction failed"));
      tx.onabort=()=>finish(tx.error||new Error("Local read transaction aborted"));
    });
  }
  async function write(storeName,value){
    const userId=value?.userId;
    const generation=generationFor(userId);
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return false;
    const db=await openDB();if(!db)return false;
    // A logout may have started while openDB() was pending.
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return false;
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,result)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        if(error)reject(error);else resolve(result);
      };
      const timer=setTimeout(()=>finish(new Error("Local write timed out")),2500);
      let tx;
      try{tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).put(value);}
      catch(error){finish(error);return;}
      tx.oncomplete=()=>finish(null,true);
      tx.onerror=()=>finish(tx.error||new Error("Local write failed"));
      tx.onabort=()=>finish(tx.error||new Error("Local write aborted"));
    });
  }
  async function remove(storeName,key,userId=null){
    const generation=generationFor(userId);
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return false;
    const db=await openDB();if(!db)return false;
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return false;
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,result)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        if(error)reject(error);else resolve(result);
      };
      const timer=setTimeout(()=>finish(new Error("Local delete timed out")),2500);
      let tx;
      try{tx=db.transaction(storeName,"readwrite");tx.objectStore(storeName).delete(key);}
      catch(error){finish(error);return;}
      tx.oncomplete=()=>finish(null,true);
      tx.onerror=()=>finish(tx.error||new Error("Local delete failed"));
      tx.onabort=()=>finish(tx.error||new Error("Local delete aborted"));
    });
  }

  async function getMessages(userId,contactId){
    if(!userId||!contactId)return [];
    const record=await read(STORE_MESSAGES,keyFor(userId,contactId),userId);
    return Array.isArray(record?.messages)?record.messages:[];
  }
  async function saveMessages(userId,contactId,messages,mergeExisting=false){
    if(!userId||!contactId||!Array.isArray(messages))return false;
    const generation=generationFor(userId);
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return false;
    const db=await openDB();if(!db)return false;
    await waitForUserClear(userId);
    if(!generationIsCurrent(userId,generation))return false;
    const key=keyFor(userId,contactId);
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_MESSAGES,"readwrite");
      const store=tx.objectStore(STORE_MESSAGES);
      const request=store.get(key);
      request.onsuccess=()=>{
        // A logout may begin while the IndexedDB read is pending. Abort this
        // transaction before it can write any stale account cache data.
        if(!generationIsCurrent(userId,generation)){
          try{tx.abort();}catch(_){}
          return;
        }
        const uniqueMessages=new Map();
        if(mergeExisting&&Array.isArray(request.result?.messages)){
          for(const message of request.result.messages){if(message?.id)uniqueMessages.set(String(message.id),message);}
        }
        for(const message of messages){if(message?.id)uniqueMessages.set(String(message.id),message);}
        const safeMessages=[...uniqueMessages.values()].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)).slice(-50).map(m=>({
          id:m.id,sender_id:m.sender_id,receiver_id:m.receiver_id,
          body:typeof m.body==="string"?m.body:null,created_at:m.created_at,
          message_type:m.message_type||"text",attachment_path:m.attachment_path||null,
          attachment_name:m.attachment_name||null,attachment_mime:m.attachment_mime||null,
          reply_to_id:m.reply_to_id||null,edited_at:m.edited_at||null
        }));
        store.put({key,userId:String(userId),contactId:String(contactId),messages:safeMessages,updatedAt:Date.now()});
      };
      request.onerror=()=>{try{tx.abort();}catch(_){};reject(request.error||new Error("Local message cache read failed"));};
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error||new Error("Local message cache write failed"));
      tx.onabort=()=>{
        if(!generationIsCurrent(userId,generation)){resolve(false);return;}
        reject(tx.error||new Error("Local message cache write aborted"));
      };
    });
  }
  async function getDraft(userId,contactId){
    if(!userId||!contactId)return "";
    const record=await read(STORE_DRAFTS,keyFor(userId,contactId),userId);
    return typeof record?.body==="string"?record.body:"";
  }
  async function saveDraft(userId,contactId,body){
    if(!userId||!contactId)return false;
    const key=keyFor(userId,contactId),value=String(body||"");
    if(!value.trim())return remove(STORE_DRAFTS,key,userId);
    return write(STORE_DRAFTS,{key,userId:String(userId),contactId:String(contactId),body:value,updatedAt:Date.now()});
  }
  async function clearDraft(userId,contactId){
    if(!userId||!contactId)return false;
    return remove(STORE_DRAFTS,keyFor(userId,contactId),userId);
  }
  async function saveTemporaryFile(userId,fileId,blob,ttlMs){
    if(!userId||!fileId||!(blob instanceof Blob))return false;
    const expiresAt=Date.now()+Math.max(60000,Number(ttlMs)||86400000);
    return write(STORE_TEMP,{key:keyFor(userId,fileId),userId:String(userId),fileId:String(fileId),blob,expiresAt});
  }
  async function getTemporaryFile(userId,fileId){
    if(!userId||!fileId)return null;
    const record=await read(STORE_TEMP,keyFor(userId,fileId),userId);
    if(!record)return null;
    if(record.expiresAt<=Date.now()){await remove(STORE_TEMP,record.key,userId);return null;}
    return record.blob||null;
  }
  function clearUser(userId){
    if(!userId)return Promise.resolve(false);
    const id=String(userId);
    // Invalidate pending operations immediately, before any async cleanup work.
    userGenerations.set(id,generationFor(id)+1);
    const previous=clearingUsers.get(id);
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    clearingUsers.set(id,gate);
    return (async()=>{
      try{
        // Queue repeated cleanup operations for the same account.
        if(previous)await previous;
        const db=await openDB();if(!db)return false;
        const names=[STORE_MESSAGES,STORE_DRAFTS,STORE_TEMP,STORE_SNAPSHOTS,STORE_SPACE_MESSAGES];
        return await new Promise((resolve,reject)=>{
          let settled=false;
          let tx;
          const finish=(error,result)=>{
            if(settled)return;
            settled=true;
            clearTimeout(timer);
            if(error)reject(error);else resolve(result);
          };
          const timer=setTimeout(()=>{
            try{tx?.abort();}catch(_){}
            finish(new Error("Local account cleanup timed out"));
          },5000);
          try{tx=db.transaction(names,"readwrite");}
          catch(error){finish(error);return;}
          for(const name of names){
            const request=tx.objectStore(name).openCursor();
            request.onsuccess=()=>{
              const cursor=request.result;
              if(!cursor)return;
              if(String(cursor.value?.userId)===id)cursor.delete();
              cursor.continue();
            };
            request.onerror=()=>{try{tx.abort();}catch(_){};finish(request.error||new Error("Local account cleanup cursor failed"));};
          }
          tx.oncomplete=()=>finish(null,true);
          tx.onerror=()=>finish(tx.error||new Error("Local account cleanup failed"));
          tx.onabort=()=>finish(tx.error||new Error("Local account cleanup aborted"));
        });
      }finally{
        if(clearingUsers.get(id)===gate)clearingUsers.delete(id);
        release();
      }
    })();
  }
  async function getSnapshot(userId,kind){
    if(!userId||!kind)return null;
    const record=await read(STORE_SNAPSHOTS,keyFor(userId,kind),userId);
    return record&&Object.prototype.hasOwnProperty.call(record,"data")?record.data:null;
  }
  async function saveSnapshot(userId,kind,data){
    if(!userId||!kind||data===undefined)return false;
    return write(STORE_SNAPSHOTS,{key:keyFor(userId,kind),userId:String(userId),kind:String(kind),data,updatedAt:Date.now()});
  }
  async function getSpaceMessages(userId,spaceId){
    if(!userId||!spaceId)return [];
    const record=await read(STORE_SPACE_MESSAGES,keyFor(userId,spaceId),userId);
    return Array.isArray(record?.messages)?record.messages:[];
  }
  async function saveSpaceMessages(userId,spaceId,messages){
    if(!userId||!spaceId||!Array.isArray(messages))return false;
    const unique=new Map();
    for(const message of messages){if(message?.id)unique.set(String(message.id),message);}
    const safe=[...unique.values()].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)).slice(-200).map(m=>({
      id:m.id,space_id:m.space_id,sender_id:m.sender_id,body:typeof m.body==="string"?m.body:null,
      created_at:m.created_at,edited_at:m.edited_at||null,message_type:m.message_type||"text",
      attachment_path:m.attachment_path||null,attachment_name:m.attachment_name||null,
      attachment_mime:m.attachment_mime||null,attachment_size:Number(m.attachment_size)||null
    }));
    return write(STORE_SPACE_MESSAGES,{key:keyFor(userId,spaceId),userId:String(userId),spaceId:String(spaceId),messages:safe,updatedAt:Date.now()});
  }
  async function requestPersistentStorage(){
    try{
      if(!navigator.storage?.persist)return false;
      return await navigator.storage.persist();
    }catch(_){return false;}
  }

  window.FarnazLocalStore=Object.freeze({
    getMessages,saveMessages,getDraft,saveDraft,clearDraft,
    getSnapshot,saveSnapshot,getSpaceMessages,saveSpaceMessages,
    saveTemporaryFile,getTemporaryFile,clearUser,requestPersistentStorage
  });
})();