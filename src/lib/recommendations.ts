export type CoPurchaseSignal={productId:string;coOrders:number;sourceOrders:number;candidateOrders:number;totalOrders:number};
export type RecommendationCandidate={id:string;name:string;category:string;price:number;featured:boolean;stock:number;published?:boolean};
export const MIN_COPURCHASE_ORDERS=3;

export function rankRelatedProducts<T extends RecommendationCandidate>(source:T,candidates:T[],signals:CoPurchaseSignal[],limit=4) {
  const byId=new Map(signals.map(signal=>[signal.productId,signal]));
  const ranked=candidates.filter(candidate=>candidate.id!==source.id&&candidate.stock>0&&candidate.published!==false).map(candidate=>{
    const signal=byId.get(candidate.id);
    const categorySimilarity=candidate.category===source.category?1:0;
    const priceDistance=Math.abs(Math.log((candidate.price+1)/(source.price+1)));
    const priceSimilarity=Math.max(0,1-priceDistance/Math.log(4));
    const editorial=(candidate.featured?1:0)*0.025;
    let purchaseScore=0;
    if(signal&&signal.coOrders>=MIN_COPURCHASE_ORDERS){
      const confidence=(signal.coOrders+1)/(signal.sourceOrders+2);
      const support=signal.coOrders/(signal.coOrders+2);
      const lift=(signal.coOrders*signal.totalOrders)/(Math.max(1,signal.sourceOrders)*Math.max(1,signal.candidateOrders));
      const liftScore=Math.max(0,Math.min(1,(lift-1)/4));
      purchaseScore=0.62+0.22*confidence*support+0.10*liftScore+0.06*categorySimilarity;
    }
    const fallbackScore=0.48*categorySimilarity+0.18*priceSimilarity+editorial;
    return {product:candidate,score:purchaseScore>0?purchaseScore+editorial:fallbackScore,purchaseBased:purchaseScore>0,coOrders:signal?.coOrders??0};
  });
  return ranked.sort((a,b)=>b.score-a.score||a.product.name.localeCompare(b.product.name,"fa")).slice(0,limit);
}
