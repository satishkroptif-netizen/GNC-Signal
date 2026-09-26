
// Telegram Bot - Gold n Crypto Verdict Bot
// Setup: Set BOT_TOKEN in Vercel env vars, then set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourdomain.vercel.app/api/telegram/bot

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SITE_URL = process.env.SITE_URL || 'https://goldncrypto-site.vercel.app';

const ASSETS = {
  btc: {label:'₿ BTC', name:'Bitcoin'},
  eth: {label:'Ξ ETH', name:'Ethereum'},
  sol: {label:'◎ SOL', name:'Solana'},
  xrp: {label:'✕ XRP', name:'XRP'},
  bnb: {label:'B BNB', name:'BNB'},
  gold: {label:'🟡 Gold', name:'Gold XAU'},
  silver: {label:'⚪ Silver', name:'Silver XAG'},
};

const TIMEFRAMES = ['15m','30m','1h','4h','1d'];

async function sendMessage(chatId, text, keyboard){
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown',
    reply_markup: keyboard ? {inline_keyboard: keyboard} : undefined
  };
  await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
}

async function getVerdict(asset, timeframe){
  try{
    const host = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : SITE_URL;
    // Direct logic if fetch fails, use internal generation
    const res = await fetch(`${host}/api/verdict/${asset}`).then(r=>r.json());
    return res.verdicts?.[timeframe] || null;
  }catch(e){ return null; }
}

function assetKeyboard(){
  return [
    [{text:'₿ BTC', callback_data:'asset_btc'}, {text:'Ξ ETH', callback_data:'asset_eth'}, {text:'◎ SOL', callback_data:'asset_sol'}],
    [{text:'✕ XRP', callback_data:'asset_xrp'}, {text:'B BNB', callback_data:'asset_bnb'}],
    [{text:'🟡 Gold', callback_data:'asset_gold'}, {text:'⚪ Silver', callback_data:'asset_silver'}],
    [{text:'📊 All Assets Overview', callback_data:'all_overview'}],
  ];
}

function timeframeKeyboard(asset){
  return [
    [{text:'⏱ 15m', callback_data:`tf_${asset}_15m`}, {text:'⏱ 30m', callback_data:`tf_${asset}_30m`}, {text:'⏱ 1H', callback_data:`tf_${asset}_1h`}],
    [{text:'⏱ 4H', callback_data:`tf_${asset}_4h`}, {text:'📅 1D', callback_data:`tf_${asset}_1d`}],
    [{text:'⬅️ Back to Assets', callback_data:'back_assets'}, {text:'🌐 Open Website', url: `${SITE_URL}/verdict.html?asset=${asset}`}],
  ];
}

export default async function handler(req, res){
  if(!BOT_TOKEN){
    return res.status(200).json({error:'BOT_TOKEN not set. Add TELEGRAM_BOT_TOKEN env var in Vercel.'});
  }
  
  if(req.method==='GET'){
    return res.status(200).json({ok:true, message:'Gold n Crypto Verdict Bot webhook is active. Set webhook to this URL.', assets: Object.keys(ASSETS), site: SITE_URL});
  }

  try{
    const update = req.body;
    
    if(update.message){
      const chatId = update.message.chat.id;
      const text = update.message.text?.toLowerCase()||'';
      
      if(text.includes('/start') || text.includes('/verdict')){
        await sendMessage(chatId, `*🪙 Gold n Crypto — AI Verdict Bot*\n\nWelcome! Select an asset to get AI prediction:\n\n*Available Assets:*\n₿ BTC • Ξ ETH • ◎ SOL • ✕ XRP • B BNB • 🟡 Gold • ⚪ Silver\n\nEach asset shows verdict for *15m, 30m, 1H, 4H, 1D* timeframes.\n\n_This is educational analysis, not financial advice._`, assetKeyboard());
      } else if(text.includes('/help')){
        await sendMessage(chatId, `*Help — Gold n Crypto Bot*\n\n/start - Show asset buttons\n/verdict - Get verdict\n/btc, /eth, /sol, /xrp, /bnb, /gold, /silver - Quick verdict for 1H\n\n*Website:* ${SITE_URL}/verdict.html`, null);
      } else if(['btc','eth','sol','xrp','bnb','gold','silver','xau','xag'].some(a=> text.includes(`/${a}`) || text===a)){
        const asset = text.replace('/','').split(' ')[0].replace('xau','gold').replace('xag','silver');
        if(ASSETS[asset]){
          const v = await getVerdict(asset, '1h');
          if(v){
            const msg = `*${ASSETS[asset].label} — ${v.timeframe} Verdict*\n\n💰 Price: $${v.price}\n📊 Bias: *${v.bias}* (${v.confidence}% confidence)\n🎯 Signal: ${v.signal}\n📈 RSI: ${v.rsi} | EMA20: $${v.ema20}\n\n🔻 Support: $${v.support}\n🔺 Resistance: $${v.resistance}\n🛑 SL: $${v.stopLoss}\n✅ T1: $${v.target1} | T2: $${v.target2}\n\n💡 ${v.reasoning}\n\n[Open full chart](${SITE_URL}/verdict.html?asset=${asset})`;
            await sendMessage(chatId, msg, timeframeKeyboard(asset));
          }
        }
      } else {
        await sendMessage(chatId, `Select an asset for verdict:`, assetKeyboard());
      }
    }
    
    if(update.callback_query){
      const chatId = update.callback_query.message.chat.id;
      const data = update.callback_query.data;
      const messageId = update.callback_query.message.message_id;
      
      // Answer callback to remove loading
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({callback_query_id: update.callback_query.id})
      });

      if(data.startsWith('asset_')){
        const asset = data.replace('asset_','');
        await sendMessage(chatId, `*${ASSETS[asset]?.label||asset.toUpperCase()} — Select Timeframe*\n\nChoose timeframe to see AI prediction:\n⏱ 15m • 30m • 1H • 4H • 1D\n\nCurrent price loading...`, timeframeKeyboard(asset));
      }
      else if(data.startsWith('tf_')){
        const parts = data.replace('tf_','').split('_');
        const asset = parts[0]; const tf = parts[1];
        const v = await getVerdict(asset, tf);
        if(v){
          const emoji = v.bias.includes('BULL') ? '🟢' : v.bias.includes('BEAR') ? '🔴' : '🟡';
          const msg = `${emoji} *${v.name} (${v.asset}) — ${v.timeframe.toUpperCase()} Verdict*\n\n💰 *Price:* $${v.price} (${v.change24h>=0?'+':''}${v.change24h}% 24h)\n📊 *Bias:* *${v.bias}* — ${v.confidence}% confidence\n🎯 *Signal:* ${v.signal}\n\n📉 *Technical:*\n• RSI(14): ${v.rsi} ${v.rsi>70?'⚠️ Overbought':v.rsi<30?'⚠️ Oversold':''}\n• EMA20: $${v.ema20} | EMA50: $${v.ema50}\n• Trend: ${v.price > v.ema20 ? 'Above EMA20 ✅' : 'Below EMA20 ❌'}\n\n🎯 *Levels:*\n🔻 Support: $${v.support}\n🔺 Resistance: $${v.resistance}\n🛑 Stop Loss: $${v.stopLoss}\n✅ Target 1: $${v.target1}\n✅ Target 2: $${v.target2}\n\n💡 *AI Reasoning:*\n${v.reasoning}\n\n⏰ Next update: 15 min | [View on Website](${SITE_URL}/verdict.html?asset=${asset}&tf=${tf})\n\n⚠️ _Not financial advice — educational only._`;
          await sendMessage(chatId, msg, [
            [{text:'🔄 Refresh', callback_data:`tf_${asset}_${tf}`}, {text:'⏱ Other TF', callback_data:`asset_${asset}`}],
            [{text:'⬅️ Assets', callback_data:'back_assets'}, {text:'🌐 Website', url: `${SITE_URL}/verdict.html?asset=${asset}&tf=${tf}`}],
          ]);
        } else {
          await sendMessage(chatId, `❌ Verdict not available for ${asset} ${tf}. Try again.`, timeframeKeyboard(asset));
        }
      }
      else if(data==='back_assets'){
        await sendMessage(chatId, `*🪙 Select Asset for Verdict*`, assetKeyboard());
      }
      else if(data==='all_overview'){
        let txt = `*📊 All Assets — Quick Overview (1H)*\n\n`;
        for(const key of Object.keys(ASSETS)){
          const v = await getVerdict(key, '1h');
          if(v){
            const icon = v.bias.includes('BULL')?'🟢':v.bias.includes('BEAR')?'🔴':'🟡';
            txt += `${icon} *${key.toUpperCase()}* $${v.price} — ${v.bias} (${v.confidence}%)\n`;
          }
        }
        txt += `\nSelect asset for detailed timeframe verdicts:`;
        await sendMessage(chatId, txt, assetKeyboard());
      }
    }
    
    res.status(200).json({ok:true});
  }catch(e){
    console.error('Bot error', e);
    res.status(200).json({ok:false, error: e.message});
  }
}
