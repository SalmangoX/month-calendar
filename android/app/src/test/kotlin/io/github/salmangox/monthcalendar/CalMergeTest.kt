package io.github.salmangox.monthcalendar

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** 原生合并和网页 MC.merge 逐条对照（期望结果由 scripts/merge-fixtures.js 用网页代码生成） */
class CalMergeTest {
    private val fx = JSONObject(javaClass.classLoader!!.getResource("merge-fixtures.json")!!.readText())

    @Test
    fun sameAsWeb() {
        val now = fx.getLong("now")
        val cases = fx.getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val got = CalMerge.merge(c.getJSONObject("a"), c.getJSONObject("b"), now)
            val want = c.getJSONObject("out")
            // 只比网页输出里有的字段（原生额外保留的未知顶层字段不算）
            for (k in want.keys()) assertEquals("case $i field $k", CalMerge.canon(want.opt(k)), CalMerge.canon(got.opt(k)))
            // 合并后的指纹：和自己再合并一次不变
            assertEquals("case $i idempotent", CalMerge.signature(got), CalMerge.signature(CalMerge.merge(got, got, now)))
        }
    }
}
