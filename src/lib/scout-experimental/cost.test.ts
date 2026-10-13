import {it,expect} from 'vitest';
import {experimentalCost} from './cost';
it('reports one settled charge and no outstanding hold for linked Apify receipts',()=>{
 const cost=experimentalCost([{actual_usd:.01,reserved_usd:.5}],[{actual_usd:0,reserved_usd:.5,capability:{provider:'apify'},input:{trialSettled:true,actualCreditValueUsd:.01}},{actual_usd:.001,reserved_usd:.005,capability:{provider:'gemini'}}]);
 expect(cost).toEqual({actualUsd:.011,reservedUsd:0,trialCreditValueUsd:.01});
});
it('keeps an unresolved charge unknown and counts a transferred reservation once',()=>{
 expect(experimentalCost([{actual_usd:null,reserved_usd:.5}],[{actual_usd:0,reserved_usd:.5,capability:{provider:'apify'}}])).toEqual({actualUsd:null,reservedUsd:.5,trialCreditValueUsd:null});
 expect(experimentalCost([],[{actual_usd:null,reserved_usd:.05,capability:{provider:'apify'}}])).toEqual({actualUsd:null,reservedUsd:.05,trialCreditValueUsd:null});
});
