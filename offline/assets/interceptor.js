(function(){
    'use strict';

    var GH_RAW = 'https://raw.githubusercontent.com/prerekhu-cloud/Mhd/main';
    var GH_ERA = GH_RAW + '/offline/data';
    var GH_3D  = GH_RAW + '/offline/3d';
    var PROD   = 'https://opava-transit-map.replit.app';

    // Flat 3D data (mhd-opava single-city) — /buildings.json etc. without /cities/ prefix
    var FLAT_3D = {
    '/buildings.json': GH_RAW + '/buildings.json',
    '/landuse.json':   GH_RAW + '/landuse.json',
    '/trees.json':     GH_RAW + '/trees.json',
    };

    // Per-city 3D assets via /cities/{slug}/{asset}.json (mhd-app multi-city layout)
    var GH_3D_ASSETS = {
    opava: {
      'buildings.json':     GH_RAW + '/buildings.json',
      'buildings-ext.json': null,
      'landuse.json':       GH_RAW + '/landuse.json',
      'trees.json':         GH_RAW + '/trees.json',
      'terrain.json':       GH_3D  + '/opava/terrain.json',
      'tiles.json':         GH_3D  + '/opava/tiles.json'
    }
    };

    // ── Era cache ─────────────────────────────────────────────────────────────
    var _eraCache = {};
    var _origFetch = window.fetch.bind(window);

    function _le(eras){ return (eras && eras.length) ? eras[eras.length-1] : {lines:[],stops:[]}; }

    function _getInlineEra(slug){
    if(_eraCache[slug]) return _eraCache[slug];
    var inline = (window.__MHD_ALL_ERAS__ || {})[slug];
    if(inline && inline.length){ _eraCache[slug] = inline; }
    return _eraCache[slug] || [];
    }

    async function _fetchFullEra(slug){
    var key = slug + '$full';
    if(_eraCache[key]) return _eraCache[key];
    try {
      var resp = await _origFetch(GH_ERA + '/' + slug + '.json');
      if(resp.ok){ var data = await resp.json(); _eraCache[key] = data; return data; }
    } catch(e){}
    return _getInlineEra(slug);
    }

    // ── GTFS helpers ──────────────────────────────────────────────────────────
    function hav(a,b,c,d){var R=6371e3,r=Math.PI/180,p=Math.sin((c-a)*r/2),q=Math.sin((d-b)*r/2);var x=p*p+Math.cos(a*r)*Math.cos(c*r)*q*q;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
    function sn(s){if(!s)return'';if(typeof s==='string')return s;return s.displayName||s.name||'';}
    function nm(n){return n.replace(/\s*\([^)]+\)/g,'').trim();}
    function sid(n,i){var h=0,k=n+i;for(var c=0;c<k.length;c++)h=(Math.imul(31,h)+k.charCodeAt(c))|0;return'S'+(h>>>0).toString(16).padStart(8,'0');}
    var SM={};
    function bsm(slug,era){
    if(SM[slug])return SM[slug];
    var stops=[],id2s={};
    (era.stops||[]).forEach(function(s,i){
      var name=nm(sn(s));if(!name)return;
      var lat=s.lat||s.stop_lat||0,lon=s.lon||s.stop_lon||0;
      var id=sid(name,i),gs={stop_id:id,stop_name:name,stop_lat:lat,stop_lon:lon};
      stops.push(gs);id2s[id]=gs;
    });
    SM[slug]={stops:stops,id2s:id2s};return SM[slug];
    }
    function lfs(era,sname){
    var n=nm(sname);
    return(era.lines||[]).filter(function(l){return(l.stops||[]).some(function(s){return nm(sn(s))===n;});});
    }
    function simDep(sname,era){
    var now=new Date(),ns=now.getHours()*3600+now.getMinutes()*60+now.getSeconds(),deps=[];
    (era.lines||[]).forEach(function(line,li){
      var stops=(line.stops||[]).map(function(s){return nm(sn(s));});
      var si=stops.findIndex(function(s){return s===nm(sname);});if(si<0)return;
      var freq=line.mode==='tram'?600:line.mode==='trolleybus'?900:1200;
      var seed=(li*127+si*73)%freq;
      var dest=stops[stops.length-1]||line.dir||'—';
      var type=line.mode==='tram'?0:line.mode==='trolleybus'?11:3;
      var col=(line.color||'#666666').replace('#','');
      for(var i=0;i<4;i++){
        var wait=((freq-(ns+seed)%freq)%freq)+i*freq;
        var mins=Math.round(wait/60);if(mins>90)continue;
        var ds=(ns+wait)%86400,hh=ds/3600|0,mm=(ds%3600)/60|0,ss=ds%60;
        deps.push({trip_id:'T_'+(line.id||li)+'_'+i,route_short_name:String(line.num||li+1),route_type:type,route_color:col,headsign:dest,departure_time:String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+':'+String(ss).padStart(2,'0'),minutes_from_now:mins,delay_seconds:null});
      }
    });
    return deps.sort(function(a,b){return a.minutes_from_now-b.minutes_from_now;}).slice(0,18);
    }
    function jr(d,s){return new Response(JSON.stringify(d),{status:s||200,headers:{'Content-Type':'application/json'}});}
    function pu(input){
    var s=typeof input==='string'?input:(input instanceof URL?input.href:(input&&input.url)||'');
    var qi=s.indexOf('?');
    return{path:qi>=0?s.slice(0,qi):s,params:new URLSearchParams(qi>=0?s.slice(qi+1):'')};
    }

    // ── Main fetch interceptor ────────────────────────────────────────────────
    window.fetch = async function(input, init){
    var r=pu(input), path=r.path, params=r.params;

    // 1. Flat 3D data (mhd-opava): /buildings.json /landuse.json /trees.json → GitHub
    if(FLAT_3D[path]) return _origFetch(FLAT_3D[path]);

    // 2. Vehicle models + textures: /models/... → production server (154 MB, CORS enabled)
    if(/^\/models\//.test(path)) return _origFetch(PROD + path);

    // 3. Multi-city /cities/{slug}/{asset}.json → GitHub (mhd-app layout)
    var m3d = path.match(/\/cities\/([^/]+)\/([^/?#]+\.json)$/);
    if(m3d){
      var cs=m3d[1], asset=m3d[2];
      var cityMap=GH_3D_ASSETS[cs];
      if(cityMap && asset in cityMap){
        var ghUrl=cityMap[asset];
        if(ghUrl) return _origFetch(ghUrl);
        return _origFetch(input, init); // null = optional/pass through
      }
      return _origFetch(input, init);
    }

    // 4. /api/city-data/:slug → full era with route paths from GitHub
    var cm=path.match(/\/api\/city-data\/([^/?#]+)/);
    if(cm) return jr(await _fetchFullEra(cm[1]));

    // 5. /api/gtfs/* → simulated from stripped inline era
    if(!path.includes('/api/gtfs/')) return _origFetch(input, init);

    var slug=params.get('city')||'opava';
    var era=_le(_getInlineEra(slug));

    if(path.includes('/gtfs/stops')){
      var q=(params.get('q')||'').toLowerCase(),bm=bsm(slug,era);
      var hits=q?bm.stops.filter(function(s){return s.stop_name.toLowerCase().includes(q);}):bm.stops;
      return jr({stops:hits.slice(0,10)});
    }
    if(path.includes('/gtfs/nearby')){
      var lat=parseFloat(params.get('lat')||'0'),lon=parseFloat(params.get('lon')||'0');
      var rad=parseFloat(params.get('radius')||'1.5')*1e3,lim=parseInt(params.get('limit')||'8');
      var bm2=bsm(slug,era);
      var near=bm2.stops
        .map(function(s){return Object.assign({},s,{dist_m:Math.round(hav(lat,lon,s.stop_lat,s.stop_lon))});})
        .filter(function(s){return s.dist_m<=rad;})
        .sort(function(a,b){return a.dist_m-b.dist_m;})
        .slice(0,lim);
      return jr({stops:near});
    }
    if(path.includes('/gtfs/stop-routes')){
      var ids=(params.get('stop_ids')||'').split(',').filter(Boolean),bm3=bsm(slug,era),routes={};
      ids.forEach(function(id){
        var st=bm3.id2s[id];if(!st)return;
        routes[id]=lfs(era,st.stop_name).map(function(l){return{short_name:String(l.num||'?'),color:l.color||'#666666',route_type:l.mode==='tram'?0:l.mode==='trolleybus'?11:3};});
      });
      return jr({routes:routes});
    }
    if(path.includes('/gtfs/departures')){
      var sid2=params.get('stop_id')||'',bm4=bsm(slug,era),st2=bm4.id2s[sid2];
      return jr({departures:st2?simDep(st2.stop_name,era):[],has_live_data:false,timetable_expired:false,timetable_max_date:null});
    }
    if(path.includes('/gtfs/route')) return jr({error:'offline'},503);
    return jr({},404);
    };

    console.info('[MHD] Offline interceptor v3: flat 3D + /models/ + GH_3D_ASSETS (incl. tiles.json)');
    })();