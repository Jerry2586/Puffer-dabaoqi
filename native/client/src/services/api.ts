import type {Catalog,Category} from '@/domain/types';
import {nativeHost,nativeRuntime} from './client-runtime';
type Pending={resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
const pending=new Map<string,Pending>();let sequence=0;
window.addEventListener('hetun-response',((event:CustomEvent)=>{const {id,data,error,status}=event.detail||{};const call=pending.get(id);if(!call)return;pending.delete(id);clearTimeout(call.timer);if(status===401)uni.removeStorageSync('hetun-member-token');if(error)call.reject(Object.assign(new Error(error),{status}));else call.resolve(data);}) as EventListener);
export function getServiceBase(){return nativeRuntime()?.apiBase||'';}
export function request<T>(route:string,method:'GET'|'POST'='GET',data?:Record<string,unknown>):Promise<T>{
 const host=nativeHost();if(!host)return Promise.reject(new Error('客户端原生宿主尚未就绪。'));
 if(pending.size>=16)return Promise.reject(new Error('请求繁忙，请稍后重试。'));
 const id=String(++sequence);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);try{host.cancelRequest?.(id);}catch{}reject(new Error('服务响应超时，请重试。'));},45000);pending.set(id,{resolve,reject,timer});try{host.request(id,route,method,data?JSON.stringify(data):'');}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}});
}
export const api={
 catalog:(page=1,keyword='',category='',ids='')=>request<Catalog>('/api/catalog?page='+page+'&keyword='+encodeURIComponent(keyword)+'&category='+encodeURIComponent(category)+'&ids='+encodeURIComponent(ids)),
 categories:()=>request<{items:Category[]}>('/api/catalog/categories'),
 playback:(id:string,sid:number,nid:number)=>request<{url:string;name:string}>('/api/playback','POST',{id,sid,nid})
};
export const memberApi={
 config:()=>request<any>('/api/member/config'),plans:()=>request<any>('/api/member/plans'),profile:()=>request<any>('/api/member/profile'),
 login:async(username:string,password:string,register=false,password2='')=>{const v=await request<any>('/api/member/'+(register?'register':'login'),'POST',{username,password,password2});uni.setStorageSync('hetun-member-token','native-session');return v;},
 logout:async()=>{await request('/api/member/logout','POST',{});uni.removeStorageSync('hetun-member-token');},
 orders:()=>request<any>('/api/member/orders'),order:(code:string)=>request<any>('/api/member/order?code='+encodeURIComponent(code)),
 purchase:(groupId:number,period:string,platform:string)=>request<any>('/api/member/purchase','POST',{groupId,period,platform}),
 upgrade:(groupId:number,period:string)=>request<any>('/api/member/upgrade','POST',{groupId,period}),recharge:(price:number,platform:string)=>request<any>('/api/member/recharge','POST',{price,platform}),
 checkout:(orderId:number,code:string,payment:string,platform:string)=>request<any>('/api/member/checkout','POST',{orderId,code,payment,platform})
};
export function assetUrl(value:string){if(!value)return '';if(/^assets\/[a-f0-9]{64}\.(png|jpg|webp|svg|mp4)$/.test(value))return '/'+value;if(/^https:\/\/[^\s]+$/i.test(value))return value;return '';}
