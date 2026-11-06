import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeReview } from '../src/lib/resumeReviewModel.ts';
const profile = { name: '山田 花子', name_kana: 'やまだ はなこ', phone: '000-111-2222', email: null,
  qualifications: ['保育士', '幼稚園教諭'], years_of_experience: 5.5 };
const school = { organization:'教育大学', department:'保育学科', start_ym:'2016-04', end_ym:'2020-03', is_current:false, education_status:'卒業' };
const job = { organization:'青空保育園', department:null, start_ym:'2020-04', end_ym:null, is_current:true, facility_type:'認可保育園', employment_type:'正社員', job_title:'保育士', age_groups:['3歳児'], class_lead:true, management_role:null, children_count:'20', duties:'保育', achievements:null, leaving_reason:null };
const resume = { birth_date:'1998-01-02', gender:null, postal_code:'1000001', address:'東京都', address_kana:null, contact_address:null, qualification_acquired:{保育士:'2020-04'}, education:[school], employment:[job], motivation:'子どもを大切にしたい', self_pr:null, strengths:null, work_summary:'5年間保育', personal_requests:null };
const prefs = { classroom_experience:['3歳児'], leadership_roles:['乳児リーダー'] };
const now = new Date(2026,10,6);
test('builds Web-equivalent school and employment chronology without mutating records',()=>{
 const before=JSON.stringify({profile,resume,prefs}); const m=buildResumeReview(profile,resume,prefs,now);
 assert.deepEqual(m.history.map(x=>x.label),['学歴','教育大学 保育学科 入学','教育大学 保育学科 卒業','職歴','青空保育園 入職（認可保育園・正社員）','現在に至る','以上']);
 assert.equal(JSON.stringify({profile,resume,prefs}),before);
 assert.deepEqual(m.gaps,[]);
});
test('qualification is always declared, never mislabeled as verified',()=>{
 const m=buildResumeReview(profile,resume,prefs,now);
 assert.deepEqual(m.licenses.map(x=>x.label),['保育士 取得','幼稚園教諭 取得']);
 assert.equal(m.licenses[0].year,'2020'); assert.equal(m.licenses[0].month,'4');
 assert.equal(JSON.stringify(m).includes('確認済'),false);
});
test('empty and missing canonical fields report the Web missing-items list, not fabricated values',()=>{
 const m=buildResumeReview({...profile,name:null,phone:null,email:null}, {...resume,birth_date:null,address:null,education:[],motivation:null,self_pr:null,employment:[]}, {classroom_experience:[],leadership_roles:[]},now);
 assert.deepEqual(m.gaps,['お名前','生年月日','住所','電話番号かメールアドレス','学歴','志望動機か自己PR']);
 assert.ok(m.history.some(x=>x.label==='なし')); assert.equal(m.birth,'');
});
test('outputs work history with documented matching-preference experience, not matching evidence',()=>{
 const m=buildResumeReview(profile,resume,prefs,now);
 assert.ok(m.work.some(x=>x.title==='保育の経験'&&x.lines.includes('リーダー・管理職：乳児リーダー')));
 assert.ok(m.work.some(x=>x.title==='青空保育園'&&x.lines.includes('業務内容：保育')));
});
test('birth date age respects the local date and avoids invalid/future years',()=>{
 assert.equal(buildResumeReview(profile,resume,prefs,now).birth,'1998年1月2日生（満28歳）');
 assert.equal(buildResumeReview(profile,{...resume,birth_date:'2027-01-01'},prefs,now).birth,'');
 assert.equal(buildResumeReview(profile,{...resume,birth_date:'1998-02-31'},prefs,now).birth,'');
});
test('history and qualifications sort with copies, preserving server order',()=>{
 const earlier = {...job,organization:'先輩園',start_ym:'2018-04',is_current:false,end_ym:'2019-03',leaving_reason:'契約期間満了により退職'};
 const next = {...resume,employment:[job,earlier],qualification_acquired:{保育士:'2020-04',幼稚園教諭:'2019-04'}};
 const m=buildResumeReview(profile,next,prefs,now);
 assert.ok(m.history.findIndex(x=>x.label.includes('先輩園')) < m.history.findIndex(x=>x.label.includes('青空保育園')));
 assert.deepEqual(m.licenses.map(x=>x.label),['幼稚園教諭 取得','保育士 取得']);
 assert.equal(next.employment[0].organization,'青空保育園');
});
