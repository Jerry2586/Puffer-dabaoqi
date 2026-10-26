package com.hetun.client

import android.content.SharedPreferences
import android.util.Base64
import org.json.JSONObject
import org.json.JSONArray
import java.net.URL
import java.net.HttpURLConnection
import java.security.KeyFactory
import java.security.MessageDigest
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/** Only addresses signed by the service key pinned during packaging may receive member tokens. */
internal class ServiceRouter(private val runtime: JSONObject, private val prefs: SharedPreferences) {
 private val settings = runtime.optJSONObject("serviceDirectory")
 private val publicKey = settings?.optString("publicKey") ?: ""
 val enabled = publicKey.isNotBlank()
 private val storageKey = "service-routing-" + MessageDigest.getInstance("SHA-256").digest(publicKey.toByteArray()).joinToString("") { "%02x".format(it) }
 private var revision = settings?.optLong("revision", 0) ?: 0
 private var addresses = strings(settings?.optJSONArray("addresses"))
 private var recovery = strings(settings?.optJSONArray("recoveryUrls"))
 init {
  if (enabled) {
   try { val cached=prefs.getString(storageKey,null); if(cached!=null) accept(JSONObject(cached),false) } catch (_:Exception) { /* Keep packaged addresses if the cache is damaged. */ }
  }
 }
 private fun strings(array: JSONArray?): List<String> = if(array==null) emptyList() else (0 until array.length()).map { array.getString(it) }
 private fun valid(value: String, file: Boolean = false): String {
  val u=java.net.URI(value)
  require(u.scheme=="https" && !u.host.isNullOrBlank() && u.rawUserInfo==null && u.rawQuery==null && u.rawFragment==null && (file || u.path.isNullOrEmpty() || u.path=="/")) { "服务地址无效" }
  return if(file) value else value.trimEnd('/')
 }
 private fun accept(envelope: JSONObject, persist: Boolean = true) {
  require(envelope.getString("publicKey")==publicKey) { "服务身份不匹配" }
  val data=Base64.decode(envelope.getString("payload"),Base64.DEFAULT)
  require(data.size<=16000) { "地址文件过大" }
  val der=Base64.decode(publicKey,Base64.DEFAULT)
  val key=KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(der))
  val verifier=Signature.getInstance("SHA256withRSA");verifier.initVerify(key);verifier.update(data)
  require(verifier.verify(Base64.decode(envelope.getString("signature"),Base64.DEFAULT))) { "地址签名验证失败" }
  val payload=JSONObject(String(data,Charsets.UTF_8))
  val keyId=MessageDigest.getInstance("SHA-256").digest(der).joinToString("") { "%02x".format(it) }
  require(payload.getString("contract")=="hetun-service-directory-v1" && payload.getString("keyId")==keyId && payload.getLong("revision")>=revision) { "服务地址文件过旧或不兼容" }
  val next=strings(payload.getJSONArray("addresses")).map { valid(it) };val nextRecovery=strings(payload.getJSONArray("recoveryUrls")).map { valid(it,true) }
  require(next.size in 1..5 && nextRecovery.size<=3) { "服务地址数量无效" }
  revision=payload.getLong("revision");addresses=next;recovery=nextRecovery
  if(persist) prefs.edit().putString(storageKey,envelope.toString()).apply()
 }
 private fun read(url: String): JSONObject {
  val connection=URL(url).openConnection() as HttpURLConnection
  connection.connectTimeout=4000;connection.readTimeout=5000;connection.instanceFollowRedirects=false
  try {
   require(connection.responseCode==200) { "服务地址暂不可用" }
   val bytes=connection.inputStream.use { readLimited(it,32768) }
   require(bytes.size<=32768) { "服务地址响应过大" }
   return JSONObject(String(bytes,Charsets.UTF_8))
  } finally { connection.disconnect() }
 }
 fun resolve(excluded: Set<String> = emptySet()): String {
  if(!enabled) return valid(runtime.optString("apiBase"))
  val queue=mutableListOf<String>(); queue.addAll(addresses)
  val original=runtime.optString("apiBase");if(original.isNotBlank()&&!queue.contains(original))queue.add(original)
  val tried=mutableSetOf<String>();var recovered=false;var index=0;var verifiedFallback: String?=null
  while(true) {
   while(index<queue.size && tried.size<12) {
    val base=valid(queue[index++]);if(base in excluded || !tried.add(base))continue
    try {
     accept(read(base+"/api/service-directory"))
     if(base in addresses)verifiedFallback=base
     for(address in addresses)if(!queue.contains(address))queue.add(address)
     // An old reachable domain can announce a new primary without receiving further business calls.
     if(base==addresses.first() && base !in excluded)return base
     val preferred=addresses.firstOrNull { it !in excluded && it !in tried }
     if(preferred!=null) { queue.add(index,preferred);continue }
     if(base in addresses)return base
    } catch (_:Exception) { }
   }
   if(verifiedFallback!=null && verifiedFallback in addresses && verifiedFallback !in excluded)return verifiedFallback
   if(recovered)break
   recovered=true
   for(url in recovery.toList())try{accept(read(valid(url,true)));for(address in addresses)if(address !in tried)queue.add(address)}catch(_:Exception){}
  }
  throw IllegalStateException("主备服务暂不可用，请稍后重试或联系运营方更新恢复地址。")
 }
}

internal fun readLimited(stream: java.io.InputStream, maximum: Int): ByteArray {
 val output=java.io.ByteArrayOutputStream();val buffer=ByteArray(8192)
 while(true){val count=stream.read(buffer,0,minOf(buffer.size,maximum+1-output.size()));if(count<0)break;output.write(buffer,0,count);if(output.size()>maximum)break}
 return output.toByteArray()
}
