import db from '../dbConfig.js';

export async function getData(query,params){
    let result = await new Promise((resolve,reject)=>{
        db.all(query,params,(err,rows)=>{
            if(err){
                return reject({status:500,error:err});
            }
            resolve({status:200,data:rows});
        });
    })
    return result;
}