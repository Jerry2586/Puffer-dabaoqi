package com.hetun.client

import java.io.FilterInputStream
import java.io.InputStream
import java.io.EOFException

internal data class ByteSelection(val status:Int,val start:Long,val length:Long,val total:Long) {
 val contentRange:String get()=if(status==416)"bytes */$total" else "bytes $start-${start+length-1}/$total"
}
/** A bounded single range; unsupported/malformed syntax falls back to the full representation. */
internal object ByteRanges {
 fun select(header:String?,total:Long):ByteSelection {
  require(total>=0)
  val full=ByteSelection(200,0,total,total)
  if(header==null||header.length>256)return full
  val match=Regex("bytes=([0-9]*)-([0-9]*)",RegexOption.IGNORE_CASE).matchEntire(header.trim()) ?: return full
  val left=match.groupValues[1];val right=match.groupValues[2]
  if(left.isEmpty()&&right.isEmpty())return full
  fun number(value:String):Long?=value.trimStart('0').ifEmpty{"0"}.toLongOrNull()
  val first:Long?=if(left.isEmpty())null else (number(left) ?: return full)
  val last:Long?=if(right.isEmpty())null else (number(right) ?: return full)
  if(first!=null&&last!=null&&last<first)return full
  if(total==0L||first!=null&&first>=total||first==null&&last==0L)return ByteSelection(416,0,0,total)
  val start=first ?: (total-minOf(requireNotNull(last),total))
  val end=if(first==null)total-1 else minOf(last ?: (total-1),total-1)
  return ByteSelection(206,start,end-start+1,total)
 }
 fun stream(input:InputStream,selection:ByteSelection):InputStream {
  try{
   var remaining=selection.start
   while(remaining>0){val skipped=input.skip(remaining);if(skipped>0)remaining-=skipped else {if(input.read()<0)throw EOFException();remaining--}}
   return object:FilterInputStream(input){
    private var left=selection.length
    override fun read():Int {if(left==0L)return -1;val value=super.read();if(value>=0)left--;return value}
    override fun read(buffer:ByteArray,offset:Int,length:Int):Int {
     if(offset<0||length<0||offset>buffer.size-length)throw IndexOutOfBoundsException()
     if(length==0)return 0;if(left==0L)return -1
     val count=`in`.read(buffer,offset,minOf(length.toLong(),left).toInt());if(count>0)left-=count;return count
    }
    override fun skip(count:Long):Long {val skipped=`in`.skip(minOf(count.coerceAtLeast(0),left));left-=skipped;return skipped}
    override fun available():Int=minOf(`in`.available().toLong(),left).toInt()
    override fun markSupported()=false
    override fun mark(readlimit:Int){}
    override fun reset(){throw java.io.IOException("Range stream cannot reset")}
   }
  }catch(e:Exception){input.close();throw e}
 }
}
