'use client'
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, Button, Input, Select, SectionHeader, EmptyState } from '@/components/ui'
import { useGoalStore } from '@/stores/useGoalStore'
import { buildGoalDashboard } from '@/engines/goal'
import type { GoalCategory, GoalPriority, Goal } from '@/types'
const CAT_LABEL: Record<GoalCategory,string> = {financial:'Financiero',personal:'Personal',relational:'Relacional',health:'Salud',career:'Carrera',spiritual:'Espiritual',creative:'Creativo'}
const PRIO_LABEL: Record<GoalPriority,string> = {critical:'Critico',high:'Alto',medium:'Medio',low:'Bajo'}
const PRIO_VARIANT: Record<GoalPriority,'bad'|'warn'|'info'|'muted'> = {critical:'bad',high:'warn',medium:'info',low:'muted'}
const STATUS_COLORS: Record<Goal['status'],string> = {active:'text-[#22c55e]',paused:'text-[#f59e0b]',completed:'text-[#3b82f6]',abandoned:'text-[#333]'}
export default function GoalsPage() {
  const {goals,addGoal,updateGoal,updateGoalProgress,completeGoal,pauseGoal}=useGoalStore()
  const dash=useMemo(()=>buildGoalDashboard(goals),[goals])
  const [adding,setAdding]=useState(false)
  const [editId,setEditId]=useState<string|null>(null)
  const [progressId,setProgressId]=useState<string|null>(null)
  const [progressVal,setProgressVal]=useState('')
  const [title,setTitle]=useState('')
  const [desc,setDesc]=useState('')
  const [cat,setCat]=useState<GoalCategory>('personal')
  const [prio,setPrio]=useState<GoalPriority>('medium')
  const [targetDate,setTargetDate]=useState('')
  const [nextAction,setNextAction]=useState('')
  const [peaceImpact,setPeaceImpact]=useState('5')
  function resetForm(){setTitle('');setDesc('');setCat('personal');setPrio('medium');setTargetDate('');setNextAction('');setPeaceImpact('5');setAdding(false);setEditId(null)}
  function saveGoal(){if(!title.trim())return;const now=new Date().toISOString();if(editId){updateGoal(editId,{title,description:desc,category:cat,priority:prio,targetDate:targetDate||undefined,nextAction:nextAction,peaceImpact:parseInt(peaceImpact)})}else{const g:Goal={id:'g_'+Date.now(),title,description:desc,category:cat,priority:prio,status:'active',progress:0,milestones:[],relatedGoals:[],relatedPersons:[],peaceImpact:parseInt(peaceImpact),obstacles:[],nextAction:nextAction,targetDate:targetDate||undefined,createdAt:now,updatedAt:now};addGoal(g)};resetForm()}
  function startEdit(g:Goal){setEditId(g.id);setTitle(g.title);setDesc(g.description);setCat(g.category);setPrio(g.priority);setTargetDate(g.targetDate||'');setNextAction(g.nextAction||'');setPeaceImpact(String(g.peaceImpact));setAdding(true)}
  function saveProgress(){if(!progressId)return;const v=parseInt(progressVal);if(isNaN(v)||v<0||v>100)return;updateGoalProgress(progressId,v);setProgressId(null);setProgressVal('')}
  const activeGoals=goals.filter(g=>g.status==='active').sort((a,b)=>{const po:Record<GoalPriority,number>={critical:0,high:1,medium:2,low:3};return po[a.priority]-po[b.priority]})
  const otherGoals=goals.filter(g=>g.status!=='active')
  return(<AppShell><SectionHeader title="Objetivos" subtitle="Direccion, paz e impacto en vida" action={<Button onClick={()=>setAdding(!adding)}>{adding?'Cancelar':'+ Nuevo objetivo'}</Button>} /><div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">{[{label:'Activos',value:String(dash.activeGoals.length)},{label:'Criticos',value:String(dash.criticalGoals.length)},{label:'Completados',value:String(goals.filter(g=>g.status==='completed').length)},{label:'Progreso prom.',value:activeGoals.length?Math.round(activeGoals.reduce((s,g)=>s+g.progress,0)/activeGoals.length)+'%':'-'}].map((s)=>(<Card key={s.label} className="flex flex-col gap-1"><div className="text-[9px] font-mono text-[#333] uppercase tracking-widest">{s.label}</div><div className="text-2xl font-mono font-bold text-[#f5f5f5]">{s.value}</div></Card>))}</div>{adding&&(<Card className="mb-4 border-[#2a2a2a]"><div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">{editId?'Editar objetivo':'Nuevo objetivo'}</div><div className="grid grid-cols-2 gap-2 mb-2"><Input placeholder="Titulo" value={title} onChange={e=>setTitle(e.target.value)} className="col-span-2" /><Input placeholder="Descripcion" value={desc} onChange={e=>setDesc(e.target.value)} className="col-span-2" /><Select value={cat} onChange={e=>setCat(e.target.value as GoalCategory)}>{(Object.keys(CAT_LABEL) as GoalCategory[]).map(c=><option key={c} value={c}>{CAT_LABEL[c]}</option>)}</Select><Select value={prio} onChange={e=>setPrio(e.target.value as GoalPriority)}>{(Object.keys(PRIO_LABEL) as GoalPriority[]).map(p=><option key={p} value={p}>{PRIO_LABEL[p]}</option>)}</Select><Input type="date" value={targetDate} onChange={e=>setTargetDate(e.target.value)} /><Input type="number" min="1" max="10" placeholder="Impacto paz (1-10)" value={peaceImpact} onChange={e=>setPeaceImpact(e.target.value)} /><Input placeholder="Siguiente accion" value={nextAction} onChange={e=>setNextAction(e.target.value)} className="col-span-2" /></div><div className="flex gap-2"><Button variant="ok" onClick={saveGoal}>{editId?'Guardar':'+ Agregar objetivo'}</Button><Butt
}
