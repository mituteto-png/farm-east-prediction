import test from 'node:test';
import assert from 'node:assert/strict';
import {addComparisonCandidate,comparisonUrl,saveCompare,storedCompare} from '../player-analysis.js';

const memory=new Map();
globalThis.localStorage={
  getItem:key=>memory.has(key)?memory.get(key):null,
  setItem:(key,value)=>memory.set(key,String(value))
};

const players=[
  {recordId:'a',batting:{pa:100},pitching:null},
  {recordId:'b',batting:{pa:80},pitching:null},
  {recordId:'c',batting:{pa:60},pitching:null},
  {recordId:'d',batting:{pa:40},pitching:null},
  {recordId:'e',batting:{pa:20},pitching:null},
  {recordId:'p1',batting:null,pitching:{games:10}},
  {recordId:'p2',batting:null,pitching:{games:8}}
];

test('comparison candidates support two, three and four players but reject a fifth',()=>{
  saveCompare([]);
  for(const id of ['a','b','c','d'])addComparisonCandidate(id,'batter',players);
  assert.deepEqual(storedCompare(),['a','b','c','d']);
  addComparisonCandidate('e','batter',players);
  assert.deepEqual(storedCompare(),['a','b','c','d']);
});

test('switching comparison category removes incompatible candidates',()=>{
  saveCompare(['a','b']);
  addComparisonCandidate('p1','pitcher',players);
  addComparisonCandidate('p2','pitcher',players);
  assert.deepEqual(storedCompare(),['p1','p2']);
});

test('comparison URL keeps stable record IDs for sharing',()=>{
  assert.equal(comparisonUrl('batter',['a','b']),'stats/compare/?role=batter&players=a%2Cb');
});
