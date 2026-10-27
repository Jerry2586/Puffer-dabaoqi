package com.hetun.client

import android.net.Uri

/** Transport bridge exposes client endpoints only; it cannot reach editor/admin/filesystem APIs. */
object ClientRoutes {
 fun networkPath(route:String,platform:String):String {
  require(platform in setOf("mobile","tablet","tv","web"))
  val prefix="/api/v1/"+(if(platform=="web")"desktop" else platform)
  return prefix+route.removePrefix("/api").removePrefix("/client")
 }
 fun allowed(route:String,method:String):Boolean {
  if(route.length>8192||!route.startsWith("/api/")||route.contains('#')||route.contains('\\')||route.any{it.isWhitespace()})return false
  val uri=Uri.parse(route)
  if(uri.scheme!=null||uri.authority!=null||uri.fragment!=null||uri.path!=uri.encodedPath)return false
  val keys=when {
   method=="GET" -> when(uri.path){
    "/api/catalog" -> setOf("page","keyword","category","ids")
    "/api/member/order" -> setOf("code")
    "/api/catalog/categories","/api/member/config","/api/member/plans","/api/member/profile","/api/member/orders" -> emptySet()
    else -> return false
   }
   method=="POST" -> {if(uri.path !in setOf("/api/playback","/api/member/login","/api/member/register","/api/member/logout","/api/member/purchase","/api/member/upgrade","/api/member/recharge","/api/member/checkout"))return false;emptySet()}
   else -> return false
  }
  return uri.queryParameterNames.all{it in keys && uri.getQueryParameters(it).size==1}
 }
}
