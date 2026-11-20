import {test} from "node:test";
import assert from "node:assert/strict";
import {rankRelatedProducts,type CoPurchaseSignal} from "./recommendations.ts";

const source={id:"a",name:"A",category:"کالا",price:100,featured:false,stock:5,published:true};
const candidate=(id:string,category="دیگر",price=100)=>({id,name:id,category,price,featured:false,stock:5,published:true});

test("ranks repeated delivered-order co-purchases above a same-category fallback",()=>{
  const boughtTogether=candidate("co"),sameCategory=candidate("same","کالا");
  const signal:CoPurchaseSignal={productId:"co",coOrders:8,sourceOrders:10,candidateOrders:9,totalOrders:100};
  const result=rankRelatedProducts(source,[sameCategory,boughtTogether],[signal]);
  assert.equal(result[0].product.id,"co");
  assert.equal(result[0].purchaseBased,true);
});
test("falls back to category and price similarity, excludes source and unavailable products",()=>{
  const sameCategory=candidate("same","کالا",105),far=candidate("far","دور",1000),empty={...candidate("empty","کالا"),stock:0};
  const result=rankRelatedProducts(source,[source,sameCategory,far,empty],[]);
  assert.deepEqual(result.map(row=>row.product.id),["same","far"]);
  assert.equal(result[0].purchaseBased,false);
});
test("does not expose sparse co-purchase patterns before the minimum support threshold",()=>{
  const boughtTogether=candidate("co"),sameCategory=candidate("same","کالا");
  const sparse:CoPurchaseSignal={productId:"co",coOrders:2,sourceOrders:3,candidateOrders:3,totalOrders:3};
  const result=rankRelatedProducts(source,[boughtTogether,sameCategory],[sparse]);
  assert.equal(result[0].product.id,"same");
  assert.equal(result[0].purchaseBased,false);
});
test("does not recommend archived items and honors the requested result limit",()=>{
  const candidates=[candidate("x"),{...candidate("y"),published:false},candidate("z")];
  assert.deepEqual(rankRelatedProducts(source,candidates,[],1).map(row=>row.product.id),["x"]);
});
