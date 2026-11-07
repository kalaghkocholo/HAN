"use strict";
(function(root){
  function messageId(value){
    const id=String(value??"").trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)){
      throw new TypeError("A valid message UUID is required for a stable cursor");
    }
    return id.toLowerCase();
  }
  function timestamp(value){
    const raw=String(value??"");
    const time=Date.parse(raw);
    if(!raw||!Number.isFinite(time))throw new TypeError("A valid message timestamp is required for a stable cursor");
    return raw;
  }
  function compareMessagesNewestFirst(a,b){
    const at=Date.parse(a?.created_at||0),bt=Date.parse(b?.created_at||0);
    if(at!==bt)return bt-at;
    const aid=String(a?.id??"").toLowerCase(),bid=String(b?.id??"").toLowerCase();
    return aid===bid?0:(aid<bid?1:-1);
  }
  function compareMessagesOldestFirst(a,b){return -compareMessagesNewestFirst(a,b);}
  function mergeMessagesNewestFirst(...groups){
    const unique=new Map();
    for(const group of groups){
      for(const message of Array.isArray(group)?group:[]){
        if(!message||message.id==null)continue;
        unique.set(String(message.id),message);
      }
    }
    return [...unique.values()].sort(compareMessagesNewestFirst);
  }
  function olderCursorFilter(message){
    const createdAt=timestamp(message?.created_at);
    const id=messageId(message?.id);
    return "created_at.lt."+createdAt+",and(created_at.eq."+createdAt+",id.lt."+id+")";
  }
  function selectConversationPage(groups,pageSize=50){
    const size=Math.max(1,Math.min(200,Math.floor(Number(pageSize)||50)));
    const all=mergeMessagesNewestFirst(...groups);
    const newest=all.slice(0,size);
    return {messages:newest.reverse(),hasMore:all.length>size,totalFetched:all.length};
  }
  const api=Object.freeze({
    compareMessagesNewestFirst,
    compareMessagesOldestFirst,
    mergeMessagesNewestFirst,
    olderCursorFilter,
    selectConversationPage
  });
  root.FarnazPrivateChatModel=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
