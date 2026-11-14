<script setup lang="ts">
import { computed, reactive } from 'vue'
import { estimateCost } from '../shared/cost'
const usage=reactive({uploads:5000,averageMB:.6,storedGB:3,photoReads:35000,aiCalls:3000,aiInput:2500,aiOutput:600,searches:0,searchPerRequest:0,emails:0,emailPerMessage:0})
const fields=[
  ['uploads','Monthly uploads'],['averageMB','Average upload (MB)'],['storedGB','Stored (GB-month)'],['photoReads','Monthly photo reads'],
  ['aiCalls','Monthly vision calls'],['aiInput','Input tokens per call'],['aiOutput','Output tokens per call'],['searches','Monthly external searches'],
  ['searchPerRequest','USD per search'],['emails','Billable emails'],['emailPerMessage','USD per billable email']
] as const
const total=computed(()=>estimateCost(usage))
const dollars=(amount:number)=>'$'+amount.toFixed(2)
</script>
<template>
  <details class="panel"><summary>Monthly usage-cost estimate</summary>
    <div class="form-grid"><label v-for="[field,label] in fields" :key="field">{{label}}<input v-model.number="usage[field]" type="number" min="0" step="any"></label></div>
    <p>{{total.addedGB.toFixed(1)}} GB added · {{dollars(total.estimated)}} estimated monthly</p>
    <p>{{dollars(total.base)}} Workers Paid base · {{dollars(total.storage+total.writes+total.reads)}} R2 · {{dollars(total.queues)}} Queues · {{dollars(total.ai)}} Vision · {{dollars(total.search+total.email)}} External search and billable email</p>
    <small>Assumes Worker, D1, KV, and Workflow usage fits included allowances. Commercial data licensing is separate.</small>
  </details>
</template>
