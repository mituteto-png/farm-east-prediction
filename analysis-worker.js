import {createLeagueModel} from './model-core.js';
import {scenarioData,championshipSimulation} from './analysis-models.js';
self.onmessage=({data})=>{try{
 const result=data.kind==='championship'?championshipSimulation(data.source):{
   before:createLeagueModel(data.source).simulate(),
   after:createLeagueModel(scenarioData(data.source,data.choices)).simulate()
 };
 self.postMessage({result});
}catch(error){self.postMessage({error:String(error)});}};
