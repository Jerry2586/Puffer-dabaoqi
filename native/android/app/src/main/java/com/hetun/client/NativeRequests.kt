package com.hetun.client

import org.json.JSONObject
import java.io.Closeable
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

internal data class ServiceResponse(val data:JSONObject,val base:String)

/** One elapsed-time budget covers queueing, directory recovery, retries and response reads. */
internal class RequestDeadline(private val milliseconds:Long) : Closeable {
 private val end=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(milliseconds)
 private val closed=AtomicBoolean(false)
 private val connection=AtomicReference<HttpURLConnection?>()
 fun check() { if(closed.get()||Thread.currentThread().isInterrupted||System.nanoTime()>=end)throw SocketTimeoutException("服务响应超时，请重试。") }
 fun remaining():Int { check();return TimeUnit.NANOSECONDS.toMillis(end-System.nanoTime()).coerceIn(1,Int.MAX_VALUE.toLong()).toInt() }
 fun attach(value:HttpURLConnection,connect:Int,read:Int) {
  check();connection.set(value)
  try{value.connectTimeout=minOf(connect,remaining());value.readTimeout=minOf(read,remaining());check()}catch(e:Exception){detach(value);throw e}
 }
 fun detach(value:HttpURLConnection) { connection.compareAndSet(value,null);value.disconnect() }
 fun abort():HttpURLConnection? { closed.set(true);return connection.getAndSet(null) }
 override fun close() { closed.set(true) }
}

/** Separate lanes prevent operations polling or a slow content request from blocking login/navigation. */
internal class NativeRequests(private val timeoutMillis:Long=30000) : Closeable {
 enum class Lane { CONTENT, AUTH, OPERATIONS }
 private fun pool(size:Int)=ThreadPoolExecutor(size,size,0L,TimeUnit.MILLISECONDS,LinkedBlockingQueue<Runnable>(16))
 private val content=pool(3)
 private val auth=pool(1)
 private val operations=pool(1)
 private val timers=ScheduledThreadPoolExecutor(2).apply{removeOnCancelPolicy=true}
 // Socket disconnect can block. Keep it off deadline, bridge and Activity threads.
 private val cleanup=ThreadPoolExecutor(0,5,5L,TimeUnit.SECONDS,LinkedBlockingQueue<Runnable>(32),java.util.concurrent.ThreadFactory{r -> Thread(r,"hetun-disconnect").apply{isDaemon=true}})
 private val active=ConcurrentHashMap<String,Call>()
 private var stopped=false
 private inner class Call(val id:String,val lane:Lane,val complete:(ServiceResponse?,Exception?)->Unit) {
  val done=AtomicBoolean(false)
  val budget=RequestDeadline(timeoutMillis)
  lateinit var task:FutureTask<Unit>
  var timer:ScheduledFuture<*>?=null
  fun finish(result:ServiceResponse?=null,error:Exception?=null,abort:Boolean=false,notify:Boolean=true) {
   if(!done.compareAndSet(false,true))return
   active.remove(id,this);timer?.cancel(false)
   if(abort) {
    val connection=budget.abort();task.cancel(true);executor(lane).remove(task)
    if(connection!=null)try{cleanup.execute{connection.disconnect()}}catch(_:RejectedExecutionException){/* In-flight reads retain finite socket timeouts. */}
   }
   try{if(notify)complete(result,error)}finally{budget.close()}
  }
 }
 private fun executor(lane:Lane)=when(lane){Lane.CONTENT->content;Lane.AUTH->auth;Lane.OPERATIONS->operations}
 @Synchronized fun submit(id:String,lane:Lane,work:(RequestDeadline)->ServiceResponse,complete:(ServiceResponse?,Exception?)->Unit):Boolean {
  if(stopped||active.containsKey(id)||active.size>=17)return false
  val call=Call(id,lane,complete)
  call.task=FutureTask { try{call.budget.check();val result=work(call.budget);call.budget.check();call.finish(result)}catch(e:Exception){call.finish(error=e)};Unit }
  active[id]=call
  try {
   call.timer=timers.schedule({call.finish(error=SocketTimeoutException("服务响应超时，请重试。"),abort=true)},timeoutMillis,TimeUnit.MILLISECONDS)
   executor(lane).execute(call.task)
  }catch(e:RejectedExecutionException){call.finish(error=e,abort=true)}
  return true
 }
 fun cancel(id:String) { active[id]?.finish(error=CancellationException("请求已取消"),abort=true,notify=false) }
 @Synchronized override fun close() {
  stopped=true
  // Iterate the concurrent view directly: Kotlin toList() can race a size==1 fast path.
  for(call in active.values)call.finish(abort=true,notify=false)
  content.shutdownNow();auth.shutdownNow();operations.shutdownNow();timers.shutdownNow();cleanup.shutdown()
 }
}
