function refreshTracks(force){
    if(simSettings.trackMode===2 && !force) return;
    tracks.clear();
    forecastTracks.clear();
    if(selectedStorm) selectedStorm.renderTrack();
    else if(simSettings.trackMode===2){
        for(let s of basin.fetchSeason(viewTick,true,true).forSystems()) if(s.TC) s.renderTrack();
    }else if(basin.viewingPresent()) for(let s of basin.activeSystems) s.fetchStorm().renderTrack();
    else for(let s of basin.fetchSeason(viewTick,true,true).forSystems()) s.renderTrack();
}

function createBuffer(w,h,noScale){
    w = w || WIDTH;
    h = h || HEIGHT;
    let b = createGraphics(w,h);
    let metadata = {
        baseWidth: w,
        baseHeight: h,
        noScale: noScale
    };
    buffers.set(b,metadata);
    return b;
}

function rescaleCanvases(s){
    for(let [buffer, metadata] of buffers){
        buffer.resizeCanvas(floor(metadata.baseWidth*s),floor(metadata.baseHeight*s));
        if(!metadata.noScale) buffer.scale(s);
    }
    resizeCanvas(floor(WIDTH*s),floor(HEIGHT*s));
}

function toggleFullscreen(){
    if(document.fullscreenElement===canvas || deviceOrientation===PORTRAIT) document.exitFullscreen();
    else{
        canvas.requestFullscreen().then(function(){
            scaler = displayWidth/WIDTH;
            rescaleCanvases(scaler);
            if(basin){
                land.clear();
                refreshTracks(true);
                Env.displayLayer();
            }
        });
    }
}

function drawBuffer(b){
    image(b,0,0,WIDTH,HEIGHT);
}

function getMouseX(){
    return floor(mouseX/scaler);
}

function getMouseY(){
    return floor(mouseY/scaler);
}

function cbrt(n){   // Cubed root function since p5 doesn't have one nor does pow(n,1/3) work for negative numbers
    return n<0 ? -pow(abs(n),1/3) : pow(n,1/3);
}

// waitForAsyncProcess allows the simulator to wait for things to load; unneeded for saving
function waitForAsyncProcess(func,desc,...args){  // add .then() callbacks inside of func before returning the promise, but add .catch() to the returned promise of waitForAsyncProcess
    waitingFor++;
    if(waitingFor<2){
        waitingDesc = desc;
        waitingTCSymbolSHem = random()<0.5;
    }
    else waitingDesc = "Waiting...";
    return func(...args).then(v=>{
        waitingFor--;
        return v;
    }).catch(e=>{
        waitingFor--;
        throw e;
    });
}

function makeAsyncProcess(func,...args){
    return new Promise((resolve,reject)=>{
        setTimeout(()=>{
            try{
                resolve(func(...args));
            }catch(err){
                reject(err);
            }
        });
    });
}

function upgradeLegacySaves(){
    return waitForAsyncProcess(()=>{
        return makeAsyncProcess(()=>{
            // Rename saved basin keys for save slot 0 from versions v20190217a and prior

            let oldPrefix = LOCALSTORAGE_KEY_PREFIX + '0-';
            let newPrefix = LOCALSTORAGE_KEY_PREFIX + LOCALSTORAGE_KEY_SAVEDBASIN + '0-';
            let f = LOCALSTORAGE_KEY_FORMAT;
            let b = LOCALSTORAGE_KEY_BASIN;
            let n = LOCALSTORAGE_KEY_NAMES;
            if(localStorage.getItem(oldPrefix+f)){
                localStorage.setItem(newPrefix+f,localStorage.getItem(oldPrefix+f));
                localStorage.removeItem(oldPrefix+f);
                localStorage.setItem(newPrefix+b,localStorage.getItem(oldPrefix+b));
                localStorage.removeItem(oldPrefix+b);
                localStorage.setItem(newPrefix+n,localStorage.getItem(oldPrefix+n));
                localStorage.removeItem(oldPrefix+n);
            }
        }).then(()=>{
            // Transfer localStorage saves to indexedDB

            return db.transaction('rw',db.saves,db.seasons,()=>{
                for(let i=0;i<localStorage.length;i++){
                    let k = localStorage.key(i);
                    if(k.startsWith(LOCALSTORAGE_KEY_PREFIX + LOCALSTORAGE_KEY_SAVEDBASIN)){
                        let s = k.slice((LOCALSTORAGE_KEY_PREFIX+LOCALSTORAGE_KEY_SAVEDBASIN).length);
                        s = s.split('-');
                        let name = parseInt(s[0]);
                        if(name===0) name = AUTOSAVE_SAVE_NAME;
                        else name = LEGACY_SAVE_NAME_PREFIX + name;
                        let pre = LOCALSTORAGE_KEY_PREFIX+LOCALSTORAGE_KEY_SAVEDBASIN+s[0]+'-';
                        if(s[1]===LOCALSTORAGE_KEY_FORMAT){
                            let obj = {};
                            obj.format = parseInt(localStorage.getItem(k),SAVING_RADIX);
                            obj.value = {};
                            obj.value.str = localStorage.getItem(pre+LOCALSTORAGE_KEY_BASIN);
                            obj.value.names = localStorage.getItem(pre+LOCALSTORAGE_KEY_NAMES);
                            db.saves.where(':id').equals(name).count().then(c=>{
                                if(c<1) db.saves.put(obj,name);
                            });
                        }else if(s[1]+'-'===LOCALSTORAGE_KEY_SEASON){
                            let y;
                            if(s[2]==='') y = -parseInt(s[3]);
                            else y = parseInt(s[2]);
                            let obj = {};
                            obj.format = FORMAT_WITH_SAVED_SEASONS;
                            obj.saveName = name;
                            obj.season = y;
                            obj.value = localStorage.getItem(k);
                            db.seasons.where('[saveName+season]').equals([name,y]).count().then(c=>{
                                if(c<1) db.seasons.put(obj);
                            });
                        }
                    }
                }
            }).then(()=>{
                for(let i=localStorage.length-1;i>=0;i--){
                    let k = localStorage.key(i);
                    if(k.startsWith(LOCALSTORAGE_KEY_PREFIX + LOCALSTORAGE_KEY_SAVEDBASIN)) localStorage.removeItem(k);
                }
            });
        });
    },'Upgrading...').catch(e=>{
        console.error(e);
    });
}

document.onfullscreenchange = function(){
    if(document.fullscreenElement===null){
        scaler = 1;
        rescaleCanvases(scaler);
        if(basin){
            land.clear();
            refreshTracks(true);
            Env.displayLayer();
        }
    }
};