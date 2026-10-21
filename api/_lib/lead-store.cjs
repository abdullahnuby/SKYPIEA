'use strict';
const leads=[];
function addLead(row){leads.push({...row});return row.reference;}
function allLeads(){return leads.map(x=>({...x}));}
module.exports={addLead,allLeads};
