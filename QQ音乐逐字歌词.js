(function(ext) {
    const lyricCache = {};
    const lineRegex = /^\[(\d+),(\d+)\](.*)$/;
    const wordRegex = /([^\(]+)\((\d+),(\d+)\)/g;
    
    ext.getLyric = function(id, time, callback) {
        if (lyricCache[id]) {
            const yrcLyrics = lyricCache[id].data.yrc.split('\n');
            const lyric = findLyricUpToCurrentWord(yrcLyrics, time);
            callback(lyric);
        } else {
            const apiUrl = `https://api.vkeys.cn/v2/music/tencent/lyric?id=${id}`;
            const xhr = new XMLHttpRequest();
            xhr.open('GET', apiUrl, true);
            
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            if (response.code === 200) {
                                lyricCache[id] = response;
                                const yrcLyrics = response.data.yrc.split('\n');
                                const lyric = findLyricUpToCurrentWord(yrcLyrics, time);
                                callback(lyric);
                            } else {
                                callback('API错误');
                            }
                        } catch (error) {
                            callback('解析错误');
                        }
                    } else {
                        callback(`请求失败: ${xhr.status}`);
                    }
                }
            };
            
            xhr.onerror = function() {
                callback('网络错误');
            };
            
            xhr.send();
        }
    };
    
    function findLyricUpToCurrentWord(yrcLyrics, time) {
        const targetTime = time * 1000;
        
        for (let i = 0; i < yrcLyrics.length; i++) {
            const line = yrcLyrics[i];
            const match = line.match(lineRegex);
            
            if (match) {
                const lineStartTime = parseInt(match[1], 10);
                const lineDuration = parseInt(match[2], 10);
                const content = match[3];
                
                if (targetTime >= lineStartTime && targetTime <= lineStartTime + lineDuration) {
                    wordRegex.lastIndex = 0;
                    let wordMatch;
                    let result = "";
                    
                    while ((wordMatch = wordRegex.exec(content)) !== null) {
                        const text = wordMatch[1];
                        const wordStartTime = parseInt(wordMatch[2], 10);
                        const wordDuration = parseInt(wordMatch[3], 10);
                        const wordEndTime = wordStartTime + wordDuration;
                        
                        if (wordEndTime <= targetTime) {
                            result += text;
                        }
                        else if (targetTime >= wordStartTime && targetTime <= wordEndTime) {
                            result += text;
                            break;
                        }
                        else if (targetTime < wordStartTime) {
                            break;
                        }
                    }
                    
                    return result;
                }
            }
        }
        
        return "";
    }
    
    ext._shutdown = function() {};
    ext._getStatus = function() {
        return { status: 2, msg: 'Ready' };
    };
    
    const descriptor = {
        blocks: [
            ['R', '获取ID %s 在 %n 秒的逐字歌词', 'getLyric', '213836590', 15]
        ]
    };
    
    ScratchExtensions.register('QQ音乐逐字歌词', descriptor, ext);
})({});