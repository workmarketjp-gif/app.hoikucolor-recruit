import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResumeA4Html, assertInlineResumePhoto } from '../src/lib/resumeA4Html.ts';
const review = {
 name: '山田 花子', kana: 'やまだ はなこ', birth: '1995年1月1日生（満31歳）', gender: '',
 address: '〒100-0000 / 東京都千代田区', contact: '080-1234-5678 / a@example.jp', createdOn: '2026年11月7日現在',
 history: [{year:'2014',month:'3',label:'〇〇高校 卒業'},{year:'',month:'',label:'以上',align:'right'}],
 licenses: [{year:'2017', month:'4',label:'保育士 取得'}],
 work: [{title:'職務要約',lines:['認可保育園で勤務。','0〜5歳児担当。']},{title:'こども園',lines:['クラス担任：あり']}],
 appeal: [{title:'自己PR',lines:['子どもの興味を大切にします。']}], requests:'貴園の規定に従います。', gaps: [],
};
test('A4 resume reflects canonical Japanese history, qualifications and appeal',()=>{
 const html=buildResumeA4Html('resume',review);assert.match(html,/@page \{ size: A4 portrait;/);assert.match(html,/山田 花子/);assert.match(html,/保育士 取得/);assert.match(html,/本人希望記入欄/);assert.match(html,/学歴・職歴/);assert.match(html,/志望の動機|自己PR/);assert.doesNotMatch(html,/https?:\/\//);});
test('A4 work history reflects canonical sections, without image or extra data',()=>{
 const html=buildResumeA4Html('work_history',review);assert.match(html,/職務経歴書/);assert.match(html,/0〜5歳児担当/);assert.match(html,/こども園/);assert.doesNotMatch(html,/data:image/);assert.doesNotMatch(html,/保育士 取得/);});
test('HTML escapes untrusted candidate content, including attributes',()=>{
 const bad={...review,name:'<script>alert("X")</script>',history:[{year:'<x>',month:'2',label:'<img src=x onerror=alert(1)> &'}]};
 const html=buildResumeA4Html('resume',bad);assert.doesNotMatch(html,/<script>|<img src=x/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img src=x/);assert.match(html,/&amp;/);});
test('empty candidate name cannot generate a PDF',()=>assert.throws(()=>buildResumeA4Html('resume',{...review,name:'  '}),/お名前/));
test('invalid document type rejects rather than silently generating',()=>assert.throws(()=>buildResumeA4Html('permit',review),/種類/));
test('reject external, local, html, and oversized photo URIs',()=>{
 for(const uri of ['https://example.com/x.jpg','file:///private/file.jpg','data:text/html;base64,AAAA','data:image/svg+xml;base64,AAAA','data:image/jpeg;base64,<script>','data:image/jpeg;base64,'+'A'.repeat(14_000_001)]){
  assert.throws(()=>assertInlineResumePhoto(uri));
 }
});
test('accept sanitized inline JPEG/PNG and restrict image to resume',()=>{
 for(const uri of ['data:image/jpeg;base64,/9j/2Q==','data:image/png;base64,iVBORw0K']){
  assert.equal(assertInlineResumePhoto(uri),uri);
  assert.match(buildResumeA4Html('resume',review,uri),/class="photo"[\s\S]*<img/);
  assert.doesNotMatch(buildResumeA4Html('work_history',review,uri),/data:image/);
 }
});
test('optional values stay optional, no invented age or qualifications',()=>{
 const none={...review,gender:'',licenses:[],birth:'',appeal:[],work:[]};
 const html=buildResumeA4Html('resume',none);assert.doesNotMatch(html,/性別/);assert.match(html,/特になし/);assert.doesNotMatch(html,/満\d+歳/);
});
test('Japanese newlines retained and unprintable control bytes removed',()=>{
 const html=buildResumeA4Html('work_history',{...review,work:[{title:'職務要約',lines:['一行目\n二行目\u0000']}]});
 assert.match(html,/一行目\n二行目/);assert.doesNotMatch(html,/\u0000/);
});
