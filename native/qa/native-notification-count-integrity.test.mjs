import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidateNotificationCountPresentation, candidateNotificationEmptyPresentation } from '../src/lib/notificationListPresentation.ts';
const base={loaded:true,loading:false,hasCanonicalError:false,visibleCount:2,visibleUnreadCount:0,unreadCount:0};
const present=(part={})=>candidateNotificationCountPresentation({...base,...part});
test('all-read requires confirmed owned list and unread count',()=>{
 assert.deepEqual(present(),{kind:'all_read',label:'すべて確認済み'});
 for(const partial of [{loaded:false},{loading:true},{hasCanonicalError:true},{unreadCount:null},{unreadCount:-1},{unreadCount:1.5}]) assert.notEqual(present(partial).kind,'all_read');
});
test('pagination permits known unread count larger than visible unread',()=>{
 assert.deepEqual(present({unreadCount:3,visibleUnreadCount:2}),{kind:'unread',label:'未読 3件'});
 assert.deepEqual(present({unreadCount:99}),{kind:'unread',label:'未読 99件'});
});
test('unread contradictions remain inconsistent, not all-read',()=>{
 for(const partial of [{visibleUnreadCount:1,unreadCount:0},{visibleCount:0,unreadCount:1},{visibleUnreadCount:2,unreadCount:1}]) assert.equal(present(partial).kind,'inconsistent');
});
test('empty is confirmed only by matching canonical zero',()=>{
 assert.equal(candidateNotificationEmptyPresentation({...base,visibleCount:0}),'confirmed_empty');
 assert.equal(candidateNotificationEmptyPresentation({...base,visibleCount:0,unreadCount:1}),'inconsistent');
 for(const partial of [{loaded:false},{loading:true},{hasCanonicalError:true},{unreadCount:null},{unreadCount:-1}]) assert.equal(candidateNotificationEmptyPresentation({...base,visibleCount:0,...partial}),'hidden');
});
test('Native screen actually connects count, mismatch and disabled mutation',()=>{
 const screen=readFileSync(new URL('../src/app/(tabs)/notifications.tsx',import.meta.url),'utf8');
 assert.match(screen,/candidateNotificationCountPresentation\(/);
 assert.match(screen,/visibleUnreadCount: notifications\.notifications\.filter\(\(notification\) => !notification\.read_at\)\.length/);
 assert.match(screen,/countPresentation\.label/);
 assert.match(screen,/const canMarkAll = countPresentation\.kind === 'unread'/);
 assert.match(screen,/disabled=\{!canMarkAll\}/);
 assert.match(screen,/emptyPresentation === 'confirmed_empty'/);
 assert.match(screen,/countPresentation\.kind === 'inconsistent'/);
});
