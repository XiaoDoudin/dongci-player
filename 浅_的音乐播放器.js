// 此扩展由"浅_酱_"编写
(function () {
    class EnhancedMusicSearchExtension {
        constructor(runtime) {
            this.runtime = runtime;
            this.currentSource = 'netease';
            this.currentPreset = 'default';
            this.currentPlaybackRate = '1';
            this.currentVolume = 100;
            this.effectsEnabled = {
                reverb: false
            };
            this.audioFilterMode = 'none'; // 'none', 'vocal', 'instrumental'
            
            
            this.vocalDetection = {
                active: false,
                frequencyRange: { min: 85, max: 255 }, 
                threshold: 0.3, 
                detectionHistory: [],
                historySize: 30,
                dynamicRange: 0,
                spectralCentroid: 0,
                vocalMask: null,
                sensitivity: 30,
                isDetected: false
            };
            
            
            this.vocalSeparation = {
                effect: 'none' // 'none', 'vocal_elimination', 'accompaniment_elimination'
            };
            
            
            this.lyricCache = {}; // {id: {source: {original, translation, yrc}, ...}}
            this.lastLyricId = null;
            
            this.baseUrls = {
                netease: 'https://api.vkeys.cn/v2/music/netease',
                tencent: 'https://api.vkeys.cn/v2/music/tencent'
            };
            this.lyricUrl = 'https://api.vkeys.cn/v2/music/netease/lyric';
            this.commentsUrl = 'https://apis.netstart.cn/music/comment/music';
            
            this.searchCacheKeys = {
                netease: 'neteaseMusicSearchCache',
                tencent: 'tencentMusicSearchCache'
            };
            this.infoCacheKeys = {
                netease: 'neteaseMusicInfoCache',
                tencent: 'tencentMusicInfoCache'
            };
            this.lyricCacheKeys = {
                lrc: 'musicLrcCache',
                yrc: 'musicYrcCache',
                trans: 'musicTransCache'
            };
            this.commentsCacheKey = 'musicCommentsCache';
            
            this.stateCacheKey = 'musicExtensionState';
            this.cacheLimit = 60;
            this.audioContext = null;
            this.audioElement = null;
            this.sourceNode = null;
            this.equalizer = [];
            this.gainNode = null;
            this.reverbNode = null;
            this.effectsMasterNode = null;
            this.reverbDryNode = null;
            this.reverbWetNode = null;
            this.analyserNode = null;
            this.vocalFilterNode = null;
            this.instrumentalFilterNode = null;
            this.vocalGainNode = null;
            this.instrumentalGainNode = null;
            this.mixerNode = null;
            this.detectionInterval = null;
            
            
            this.channelSplitter = null;
            this.channelMerger = null;
            this.leftGain = null;
            this.rightGain = null;
            this.leftFilter = null;
            this.rightFilter = null;
            this.masterFilter = null;
            
            this.currentMusicInfo = {
                id: null,
                url: null,
                song: null,
                singer: null,
                album: null,
                interval: null,
                size: null,
                quality: null
            };
            this.equalizerFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
            this.equalizerPresets = {
                default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                surround: [4, 3, 2, 1, -1, -2, 1, 3, 5, 6],
                classical: [-2, -2, -3, -2, 1, 3, 3, 4, 4, 3],
                pop: [2, 2, 1, -1, -2, -1, 2, 3, 3, 2],
                rock: [4, 4, 3, -1, -3, -2, 1, 3, 5, 5],
                jazz: [3, 2, -1, -2, -1, 2, 3, 4, 4, 3],
                bass: [6, 6, 5, 4, 2, -1, -3, -3, -2, -2],
                treble: [-3, -3, -4, -3, 0, 3, 5, 6, 7, 7]
            };
            
            this.effectsPresets = {
                default: {
                    reverb: {
                        wet: 0.3,
                        dry: 0.7,
                        roomSize: 0.5,
                        damping: 0.5
                    }
                },
                concertHall: {
                    reverb: {
                        wet: 0.6,
                        dry: 0.4,
                        roomSize: 0.9,
                        damping: 0.3
                    }
                },
                smallRoom: {
                    reverb: {
                        wet: 0.4,
                        dry: 0.6,
                        roomSize: 0.3,
                        damping: 0.7
                    }
                },
                studio: {
                    reverb: {
                        wet: 0.2,
                        dry: 0.8,
                        roomSize: 0.1,
                        damping: 0.9
                    }
                }
            };
            this.autohueColors = {
                "主色调": "#000000",
                "辅助色调": "#FFFFFF",
                "顶部边缘色": "#000000",
                "右侧边缘色": "#000000",
                "底部边缘色": "#000000",
                "左侧边缘色": "#000000"
            };
            this.autohueStatus = "未加载";
            
            this.currentEffectsConfig = JSON.parse(JSON.stringify(this.effectsPresets.default));
            
            this.initializeCache();
            this.loadState();
        }
        
        rgbToLab(r, g, b) {
            let R = r / 255, G = g / 255, B = b / 255;
            R = R > .04045 ? Math.pow((R + .055) / 1.055, 2.4) : R / 12.92;
            G = G > .04045 ? Math.pow((G + .055) / 1.055, 2.4) : G / 12.92;
            B = B > .04045 ? Math.pow((B + .055) / 1.055, 2.4) : B / 12.92;
            let X = R * .4124 + G * .3576 + B * .1805;
            let Y = R * .2126 + G * .7152 + B * .0722;
            let Z = R * .0193 + G * .1192 + B * .9505;
            X = X / .95047;
            Y = Y / 1;
            Z = Z / 1.08883;
            const f = (t) => t > .008856 ? Math.pow(t, .3333333333333333) : 7.787 * t + .13793103448275862;
            const fx = f(X);
            const fy = f(Y);
            const fz = f(Z);
            const L = 116 * fy - 16;
            const a = 500 * (fx - fy);
            const bVal = 200 * (fy - fz);
            return [L, a, bVal];
        }

        labDistance(lab1, lab2) {
            const dL = lab1[0] - lab2[0];
            const da = lab1[1] - lab2[1];
            const db = lab1[2] - lab2[2];
            return Math.sqrt(dL * dL + da * da + db * db);
        }

        rgbToHex(rgb) {
            return "#" + rgb.map((v) => {
                const hex = Math.round(v).toString(16);
                return hex.length === 1 ? "0" + hex : hex;
            }).join("");
        }

        async loadImageForAutohue(imageSource) {
            return new Promise((resolve, reject) => {
                let img;
                if (typeof imageSource === "string") {
                    img = new Image();
                    img.crossOrigin = "Anonymous";
                    img.src = imageSource;

                    const timeout = setTimeout(() => {
                        reject(new Error("网络有点坏了qwq"));
                    }, 10000);

                    img.onload = () => {
                        clearTimeout(timeout);
                        resolve(img);
                    };

                    img.onerror = (err) => {
                        clearTimeout(timeout);
                        reject(new Error(`呃，好尴尬，因为: ${err.message}`));
                    };
                } else {
                    img = imageSource;
                    if (img.complete) resolve(img);
                    else {
                        img.onload = () => resolve(img);
                        img.onerror = (err) => reject(err);
                    }
                }
            });
        }

        getImageDataFromImage(img, maxSize = 100) {
            const canvas = document.createElement("canvas");
            let width = img.naturalWidth;
            let height = img.naturalHeight;
            if (width > maxSize || height > maxSize) {
                const scale = Math.min(maxSize / width, maxSize / height);
                width = Math.floor(width * scale);
                height = Math.floor(height * scale);
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("无法获取摄像机颜色");
            ctx.drawImage(img, 0, 0, width, height);
            return ctx.getImageData(0, 0, width, height);
        }

        clusterPixelsByCondition(imageData, condition, threshold = 10) {
            const clusters = [];
            const data = imageData.data;
            const width = imageData.width;
            const height = imageData.height;
            for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                if (!condition(x, y)) continue;
                const index = (y * width + x) * 4;
                if (data[index + 3] === 0) continue;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const lab = this.rgbToLab(r, g, b);
                let added = false;
                for (const cluster of clusters) {
                    const d = this.labDistance(lab, cluster.averageLab);
                    if (d < threshold) {
                        cluster.count++;
                        cluster.sumRgb[0] += r;
                        cluster.sumRgb[1] += g;
                        cluster.sumRgb[2] += b;
                        cluster.sumLab[0] += lab[0];
                        cluster.sumLab[1] += lab[1];
                        cluster.sumLab[2] += lab[2];
                        cluster.averageRgb = [
                            cluster.sumRgb[0] / cluster.count,
                            cluster.sumRgb[1] / cluster.count,
                            cluster.sumRgb[2] / cluster.count
                        ];
                        cluster.averageLab = [
                            cluster.sumLab[0] / cluster.count,
                            cluster.sumLab[1] / cluster.count,
                            cluster.sumLab[2] / cluster.count
                        ];
                        added = true;
                        break;
                    }
                }
                if (!added) clusters.push({
                    count: 1,
                    sumRgb: [r, g, b],
                    sumLab: [lab[0], lab[1], lab[2]],
                    averageRgb: [r, g, b],
                    averageLab: [lab[0], lab[1], lab[2]]
                });
            }
            return clusters;
        }

        __handleAutoHueOptions(options) {
            if (!options) options = {};
            const { maxSize = 100 } = options;
            let threshold = options.threshold || 10;
            if (typeof threshold === "number") threshold = {
                primary: threshold,
                left: threshold,
                right: threshold,
                top: threshold,
                bottom: threshold
            };
            else threshold = {
                primary: threshold.primary || 10,
                left: threshold.left || 10,
                right: threshold.right || 10,
                top: threshold.top || 10,
                bottom: threshold.bottom || 10
            };
            return { maxSize, threshold };
        }

        async autohueColorPicker(imageSource, options) {
            const { maxSize, threshold } = this.__handleAutoHueOptions(options);
            const img = await this.loadImageForAutohue(imageSource);
            const imageData = this.getImageDataFromImage(img, maxSize);

            let clusters = this.clusterPixelsByCondition(imageData, () => true, threshold.primary);
            clusters.sort((a, b) => b.count - a.count);
            const primaryCluster = clusters[0];
            const secondaryCluster = clusters.length > 1 ? clusters[1] : clusters[0];

            const primaryColor = this.rgbToHex(primaryCluster.averageRgb);
            const secondaryColor = this.rgbToHex(secondaryCluster.averageRgb);

            const margin = 10;
            const width = imageData.width;
            const height = imageData.height;

            const topClusters = this.clusterPixelsByCondition(imageData, (_x, y) => y < margin, threshold.top);
            topClusters.sort((a, b) => b.count - a.count);
            const topColor = topClusters.length > 0 ? this.rgbToHex(topClusters[0].averageRgb) : primaryColor;

            const bottomClusters = this.clusterPixelsByCondition(imageData, (_x, y) => y >= height - margin, threshold.bottom);
            bottomClusters.sort((a, b) => b.count - a.count);
            const bottomColor = bottomClusters.length > 0 ? this.rgbToHex(bottomClusters[0].averageRgb) : primaryColor;

            const leftClusters = this.clusterPixelsByCondition(imageData, (x, _y) => x < margin, threshold.left);
            leftClusters.sort((a, b) => b.count - a.count);
            const leftColor = leftClusters.length > 0 ? this.rgbToHex(leftClusters[0].averageRgb) : primaryColor;

            const rightClusters = this.clusterPixelsByCondition(imageData, (x, _y) => x >= width - margin, threshold.right);
            rightClusters.sort((a, b) => b.count - a.count);
            const rightColor = rightClusters.length > 0 ? this.rgbToHex(rightClusters[0].averageRgb) : primaryColor;

            return {
                primaryColor,
                secondaryColor,
                backgroundColor: { top: topColor, right: rightColor, bottom: bottomColor, left: leftColor }
            };
        }

        async extractColors(args) {
            try {
                this.autohueStatus = "处理中";
                if (!args.IMAGE.startsWith("http://") && !args.IMAGE.startsWith("https://")) {
                    throw new Error("图片URL必须以http://或https://开头");
                }

                const result = await this.autohueColorPicker(args.IMAGE, {
                    threshold: parseInt(args.THRESHOLD, 10)
                });

                const validateAndSetColor = (key, value) => {
                    if (/^#([0-9A-F]{3}){1,2}$/i.test(value)) {
                        this.autohueColors[key] = value;
                    } else {
                        console.warn(`颜色值无效 ${value} 被忽略，所以用了默认值`);
                    }
                };

                validateAndSetColor("主色调", result.primaryColor);
                validateAndSetColor("辅助色调", result.secondaryColor);
                validateAndSetColor("顶部边缘色", result.backgroundColor.top);
                validateAndSetColor("右侧边缘色", result.backgroundColor.right);
                validateAndSetColor("底部边缘色", result.backgroundColor.bottom);
                validateAndSetColor("左侧边缘色", result.backgroundColor.left);

                this.autohueStatus = "提取成功";
            } catch (error) {
                this.autohueStatus = `提取失败: ${error.message}`;
                console.error("qwq，提取颜色失败了:", error);
            }
        }

        getPrimaryColor() {
            const color = this.autohueColors["主色调"] || "#000000";
            return color;
        }

        getSecondaryColor() {
            const color = this.autohueColors["辅助色调"] || "#FFFFFF";
            return color;
        }

        getEdgeColor(args) {
            const color = this.autohueColors[args.EDGE] || "#000000";
            return color;
        }

        getColorEffectValue(args) {
            try {
                const colorType = args.COLOR_TYPE || "主色调";
                const color = this.autohueColors[colorType] || "#000000";
                const rgb = this.hexToRgb(color);

                if (!rgb) {
                    console.warn("无法解析颜色，返回默认特效值0");
                    return 0;
                }

                const hue = this.rgbToHue(rgb.r, rgb.g, rgb.b);
                const effectValue = Math.round((hue / 100) * 200);
                const clampedValue = Math.max(0, Math.min(200, effectValue));

                return clampedValue;
            } catch (error) {
                this.autohueStatus = `获取颜色特效值失败: ${error.message}`;
                console.error("获取颜色特效值失败:", error);
                return 0;
            }
        }

        getBrightnessValue(args) {
            try {
                const colorType = args.COLOR_TYPE || "主色调";
                const color = this.autohueColors[colorType] || "#000000";
                const rgb = this.hexToRgb(color);

                if (!rgb) {
                    console.warn("无法解析颜色，返回默认亮度值0");
                    return 0;
                }

                const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
                let brightnessValue = Math.round((luminance * 200) - 100);
                brightnessValue = Math.max(-100, Math.min(100, brightnessValue));

                return brightnessValue;
            } catch (error) {
                this.autohueStatus = `获取亮度值失败: ${error.message}`;
                console.error("获取亮度值失败:", error);
                return 0;
            }
        }

        getAutohueStatus() {
            return this.autohueStatus;
        }

        hexToRgb(hex) {
            try {
                if (!/^#([0-9A-F]{3}){1,2}$/i.test(hex)) {
                    throw new Error(`无效的颜色格式: ${hex}`);
                }

                let rHex, gHex, bHex;
                if (hex.length === 4) {
                    rHex = hex[1] + hex[1];
                    gHex = hex[2] + hex[2];
                    bHex = hex[3] + hex[3];
                } else {
                    rHex = hex.slice(1, 3);
                    gHex = hex.slice(3, 5);
                    bHex = hex.slice(5, 7);
                }

                const rgb = {
                    r: parseInt(rHex, 16),
                    g: parseInt(gHex, 16),
                    b: parseInt(bHex, 16)
                };

                if (isNaN(rgb.r) || isNaN(rgb.g) || isNaN(rgb.b) ||
                    rgb.r < 0 || rgb.r > 255 ||
                    rgb.g < 0 || rgb.g > 255 ||
                    rgb.b < 0 || rgb.b > 255) {
                    throw new Error(`无效的RGB值: ${JSON.stringify(rgb)}`);
                }

                return rgb;
            } catch (error) {
                console.error("颜色转换失败:", error);
                return null;
            }
        }

        rgbToHue(r, g, b) {
            r /= 255;
            g /= 255;
            b /= 255;

            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h = 0;

            if (max !== min) {
                const d = max - min;
                switch (max) {
                    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                    case g: h = (b - r) / d + 2; break;
                    case b: h = (r - g) / d + 4; break;
                }
                h /= 6;
            }

            const hueValue = Math.round(h * 100);
            return Number(hueValue);
        }
    

        initializeCache() {
            const cacheKeys = [
                this.searchCacheKeys.netease,
                this.infoCacheKeys.netease,
                this.searchCacheKeys.tencent,
                this.infoCacheKeys.tencent,
                this.lyricCacheKeys.lrc,
                this.lyricCacheKeys.yrc,
                this.lyricCacheKeys.trans,
                this.commentsCacheKey,
                this.stateCacheKey
            ];
            cacheKeys.forEach(key => {
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key, JSON.stringify({}));
                }
            });
        }

        saveState() {
            const state = {
                currentSource: this.currentSource,
                currentPreset: this.currentPreset,
                currentPlaybackRate: this.currentPlaybackRate,
                currentVolume: this.currentVolume,
                effectsEnabled: this.effectsEnabled,
                currentEffectsConfig: this.currentEffectsConfig,
                audioFilterMode: this.audioFilterMode,
                vocalDetection: {
                    frequencyRange: this.vocalDetection.frequencyRange,
                    threshold: this.vocalDetection.threshold,
                    sensitivity: this.vocalDetection.sensitivity
                },
                vocalSeparation: this.vocalSeparation
            };
            localStorage.setItem(this.stateCacheKey, JSON.stringify(state));
        }

        loadState() {
            const state = JSON.parse(localStorage.getItem(this.stateCacheKey) || '{}');
            if (['netease', 'tencent'].includes(state.currentSource)) {
                this.currentSource = state.currentSource;
            }
            if (Object.keys(this.equalizerPresets).includes(state.currentPreset)) {
                this.currentPreset = state.currentPreset;
            }
            if (['0.5', '1', '1.25', '1.5', '2', '3'].includes(state.currentPlaybackRate)) {
                this.currentPlaybackRate = state.currentPlaybackRate;
            }
            if (typeof state.currentVolume === 'number' && state.currentVolume >= 1 && state.currentVolume <= 150) {
                this.currentVolume = state.currentVolume;
            }
            
            if (state.effectsEnabled && typeof state.effectsEnabled === 'object') {
                this.effectsEnabled = { ...this.effectsEnabled, ...state.effectsEnabled };
            }
            
            if (state.currentEffectsConfig && typeof state.currentEffectsConfig === 'object') {
                this.currentEffectsConfig = { ...this.currentEffectsConfig, ...state.currentEffectsConfig };
            }
            
            if (['none', 'vocal', 'instrumental'].includes(state.audioFilterMode)) {
                this.audioFilterMode = state.audioFilterMode;
            }

            if (state.vocalDetection && typeof state.vocalDetection === 'object') {
                if (state.vocalDetection.frequencyRange) {
                    this.vocalDetection.frequencyRange = { ...this.vocalDetection.frequencyRange, ...state.vocalDetection.frequencyRange };
                }
                if (typeof state.vocalDetection.threshold === 'number') {
                    this.vocalDetection.threshold = state.vocalDetection.threshold;
                }
                if (typeof state.vocalDetection.sensitivity === 'number') {
                    this.vocalDetection.sensitivity = state.vocalDetection.sensitivity;
                }
            }
            
            if (state.vocalSeparation && typeof state.vocalSeparation === 'object') {
                this.vocalSeparation = { ...this.vocalSeparation, ...state.vocalSeparation };
            }
        }
        

        getInfo() {
            const 统一图标 = 'data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjEiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgeG1sbnM6eGxpbms9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkveGxpbmsiIHdpZHRoPSI4OS40NTg5NiIgaGVpZ2h0PSI4OC4yODY5IiB2aWV3Qm94PSIwLDAsODkuNDU4OTYsODguMjg2OSI+PGRlZnM+PHJhZGlhbEdyYWRpZW50IGN4PSIyNDAiIGN5PSIxODAiIHI9IjQxLjcyOTQ4IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgaWQ9ImNvbG9yLTEiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzhmMDBhNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzAwYTRmZiIvPjwvcmFkaWFsR3JhZGllbnQ+PHJhZGlhbEdyYWRpZW50IGN4PSIyNDAiIGN5PSIxODAiIHI9IjQxLjcyOTQ4IiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgaWQ9ImNvbG9yLTIiPjxzdG9wIG9mZnNldD0iMCIgc3RvcC1jb2xvcj0iIzhmMDBhNSIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzRmNmNmZiIgc3RvcC1vcGFjaXR5PSIwLjY5ODA0Ii8+PC9yYWRpYWxHcmFkaWVudD48L2RlZnM+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTE5NS4yNzA1MiwtMTM1LjI3MDUyKSI+PGcgZmlsbD0ibm9uZSIgc3Ryb2tlLW1pdGVybGltaXQ9IjEwIj48cGF0aCBkPSJNMTk4LjI3MDUyLDE4MGMwLC02LjIzNjM3IDUuMjgxNjMsLTE2Ljk3ODA1IDcuOTM4NDEsLTIyLjE2ODk5YzQuNDY3MTQsLTguNzI4MTEgOC4zNjYzLC0xMC43NTc4MyAxNy4yNzE5NiwtMTQuOTMyNTNjNS4zNzEyLC0yLjUxNzg1IDEwLjE5NDgzLC00LjYyNzk2IDE2LjUxOTExLC00LjYyNzk2YzYuMzU1NDEsMCAxMy43ODU0NiwzLjk5OTI5IDE5LjE3NjkyLDYuNTQwNTJjNy44OTA0NSwzLjcxOTEyIDEzLjk1ODE2LDEwLjY5NDM0IDE4LjE5OTQ5LDE3LjM2OTU3YzMuMzY5NzksNS4zMDM1NSA0LjM1MzA4LDEwLjQyOTQ2IDQuMzUzMDgsMTcuODE5MzljMCwzLjU2MzM5IC0xLjYxODcsNy4yNTY4OCAtMi40NTkwNiwxMC41NTg3Yy00LjU5NDcyLDE4LjA1MzAyIC0yMS42NjI1NSwyOS45OTg3MiAtNDEuMTQ1NzIsMjkuOTk4NzJjLTE3Ljk2MTEyLDAgLTMwLjQ5MjAyLC0xMS44MDc2NyAtMzUuODcxNzQsLTI3LjQxMDQ1Yy0xLjUyMzE5LC00LjQxNzcgLTMuOTgyNDQsLTguMDYxNTQgLTMuOTgyNDQsLTEzLjE0Njk3eiIgc3Ryb2tlPSJ1cmwoI2NvbG9yLTEpIiBzdHJva2Utd2lkdGg9IjYiIHN0cm9rZS1saW5lY2FwPSJidXR0Ii8+PHBhdGggZD0iTTI1Mi42MzUwNCwxNjIuMTgwNTZjMCwwIC01LjA0NDkzLC0wLjUzNjM2IC02LjA4Mjg1LDQuMTYxNDljLTIuNjEzNDQsMTEuODI5MDQgMi40MDc3NywyMy4zMzYzOSAtNy40NjA3MywyMi4zMTY5Yy00LjE4NDU2LC0wLjQzMjMgLTYuNDMwODUsLTEuOTgyNDMgLTUuNTUxNTEsLTcuNTYxMDljMC45Njk3NSwtNi4xNTIyMiAzLjM5NTkyLC04LjEwMjc1IDkuMDIyMywtNy44NjYxOGMwLjczMTIyLDAuMDMwNzQgNy4zNjMyOSwtMS41MjY3NSAxMC4zODA3MSwyLjM1MTk0YzQuNjMzNDcsNS45NTYwMiAyLjg4OTc0LDIzLjY3MDI1IC0xNC4zOTI0NCwyMi4xNjM4NmMtNS4xOTE1MywtMC40NTI1MSAtMTQuMzk1MjIsLTIuMDY4OTUgLTEzLjY1MjAzLC0xNS41NTg3N2MwLjU1Njg3LC0xMC4xMDc4NCA5LjI1OTYsLTEwLjU0MTE4IDkuMjU5NiwtMTAuNTQxMTgiIHN0cm9rZT0iI2FkMDBmZiIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNMjAwLjg3NzY3LDE4MGMwLC0yMS42MDY2NiAxNy41MTU2NiwtMzkuMTIyMzMgMzkuMTIyMzMsLTM5LjEyMjMzYzIxLjYwNjY2LDAgMzkuMTIyMzMsMTcuNTE1NjYgMzkuMTIyMzMsMzkuMTIyMzNjMCwyMS42MDY2NiAtMTcuNTE1NjYsMzkuMTIyMzMgLTM5LjEyMjMzLDM5LjEyMjMzYy0yMS42MDY2NiwwIC0zOS4xMjIzMywtMTcuNTE1NjYgLTM5LjEyMjMzLC0zOS4xMjIzM3oiIHN0cm9rZT0iI2FkMDBmZiIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjxwYXRoIGQ9Ik0yNTAuOTQxMzYsMTYwLjQ4Njg3YzAsMCAtNS4wNDQ5MywtMC41MzYzNiAtNi4wODI4NSw0LjE2MTQ5Yy0yLjYxMzQ0LDExLjgyOTA0IDIuNDA3NzcsMjMuMzM2MzkgLTcuNDYwNzMsMjIuMzE2OWMtNC4xODQ1NiwtMC40MzIzIC02LjQzMDg1LC0xLjk4MjQzIC01LjU1MTUxLC03LjU2MTA5YzAuOTY5NzUsLTYuMTUyMjIgMy4zOTU5MiwtOC4xMDI3NSA5LjAyMjMsLTcuODY2MThjMC43MzEyMiwwLjAzMDc0IDcuMzYzMjksLTEuNTI2NzUgMTAuMzgwNzEsMi4zNTE5NGM0LjYzMzQ3LDUuOTU2MDIgMi44ODk3NCwyMy42NzAyNSAtMTQuMzkyNDQsMjIuMTYzODZjLTUuMTkxNTMsLTAuNDUyNTEgLTE0LjM5NTIyLC0yLjA2ODk1IC0xMy42NTIwMywtMTUuNTU4NzdjMC41NTY4NywtMTAuMTA3ODQgOS4yNTk2LC0xMC41NDExOCA5LjI1OTYsLTEwLjU0MTE4IiBzdHJva2U9IiMwMGE0ZmYiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PHBhdGggZD0iTTI3Ny43NDcwNCwxOTMuMTQ2OTdjLTUuMzc5NzMsMTUuNjAyNzggLTE3LjkxMDYyLDI3LjQxMDQ1IC0zNS44NzE3NCwyNy40MTA0NWMtMTkuNDgzMTYsMCAtMzYuNTUxLC0xMS45NDU2OSAtNDEuMTQ1NzIsLTI5Ljk5ODcyYy0wLjg0MDM1LC0zLjMwMTgzIC0yLjQ1OTA2LC02Ljk5NTMyIC0yLjQ1OTA2LC0xMC41NTg3MWMwLC03LjM4OTkzIDAuOTgzMjksLTEyLjUxNTg0IDQuMzUzMDgsLTE3LjgxOTM5YzQuMjQxMzMsLTYuNjc1MjMgMTAuMzA5MDQsLTEzLjY1MDQ1IDE4LjE5OTQ5LC0xNy4zNjk1N2M1LjM5MTQ2LC0yLjU0MTIzIDEyLjgyMTUsLTYuNTQwNTIgMTkuMTc2OTIsLTYuNTQwNTJjNi4zMjQyOCwwIDExLjE0NzkxLDIuMTEwMTEgMTYuNTE5MTEsNC42Mjc5NmM4LjkwNTY2LDQuMTc0NyAxMi44MDQ4Miw2LjIwNDQyIDE3LjI3MTk2LDE0LjkzMjUzYzIuNjU2NzgsNS4xOTA5MyA3LjkzODQxLDE1LjkzMjYzIDcuOTM4NDEsMjIuMTY4OTljMCw1LjA4NTQzIC0yLjQ1OTI1LDguNzI5MjcgLTMuOTgyNDQsMTMuMTQ2OTd6IiBzdHJva2U9InVybCgjY29sb3ItMikiIHN0cm9rZS13aWR0aD0iNC41IiBzdHJva2UtbGluZWNhcD0iYnV0dCIvPjwvZz48L2c+PC9zdmc+PCEtLXJvdGF0aW9uQ2VudGVyOjQ0LjcyOTQ3OTk5OTk5OTk5NTo0NC43Mjk0Nzk5OTk5OTk5OTUtLT4=';
            
            return {
                id: 'enhancedMusicSearch',
                name: '浅_酱_的在线音乐播放器',
                description: '在线音乐播放器扩展',
                color1: '#000000',
                color2: '#00a4ff',
                blockIconURI: 统一图标,
                //----------块----------
                blocks: [
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: '音乐相关'
                    },
                    {
                        opcode: 'searchAndGetUrl',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '搜索[QUERY]返回第[INDEX]个的歌曲URL',
                        arguments: {
                            QUERY: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Take Me Hand'
                            },
                            INDEX: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getCoverUrlById',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'ID[ID]的歌曲封面URL',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getSongInfoById',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'ID[ID]的[FIELD]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            FIELD: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'songFields',
                                defaultValue: 'url'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getSearchResultField',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '搜索[QUERY]第[INDEX]个的[FIELD]',
                        arguments: {
                            QUERY: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Take Me Hand'
                            },
                            INDEX: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },
                            FIELD: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'searchFields',
                                defaultValue: 'song'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getCommentField',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '获取[ID]第[INDEX]条评论的[FIELD]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            INDEX: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1
                            },
                            FIELD: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'commentFields',
                                defaultValue: '用户名'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'clearCommentCache',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '清除音乐[ID]的评论缓存',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'clearCache',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '清除所有缓存',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'changeMusicSource',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '修改音源为[SOURCE]',
                        arguments: {
                            SOURCE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'musicSources',
                                defaultValue: 'netease'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getUrlByIdAndQuality',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '获取ID[ID] 音质[QUALITY]的歌曲URL',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            QUALITY: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '9'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                                        {
                        blockType: Scratch.BlockType.LABEL,
                        text: '播放器相关'
                    },
                    {
                        opcode: 'playMusicFromUrl',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '播放[URL]的音乐',
                        arguments: {
                            URL: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'https://example.com/music.mp3'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'controlMusicPlayback',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置当前播放的音乐[ACTION]',
                        arguments: {
                            ACTION: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'playbackActions',
                                defaultValue: 'play'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setPlaybackRate',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置当前播放音乐的倍速为[SPEED]',
                        arguments: {
                            SPEED: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'playbackRates',
                                defaultValue: '1x'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'adjustFrequency',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '调整[FREQUENCY]Hz频段强度为[GAIN]',
                        arguments: {
                            FREQUENCY: {
                                type: Scratch.ArgumentType.NUMBER,
                                menu: 'frequencyBands',
                                defaultValue: 250
                            },
                            GAIN: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0,
                                min: -12,
                                max: 12
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'seekToTime',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '跳转到时间[TIME]秒',
                        arguments: {
                            TIME: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0,
                                min: 0
                            }
                        },
                        blockIconURI: 统一图标
                    },
                                        {
                        blockType: Scratch.BlockType.LABEL,
                        text: '播放器状态'
                    },
                    {
                        opcode: 'getSongLyric',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '获取音乐[ID]的[LYRIC_TYPE]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            LYRIC_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'lyricTypes',
                                defaultValue: 'lrc歌词'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getFullSongLyric',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '获取音乐[ID]的完整[LYRIC_TYPE]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            LYRIC_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'lyricTypes',
                                defaultValue: 'lrc歌词'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getLyricAtTime',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '获取音乐[ID]在[TIME]秒的[LYRIC_TYPE]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            TIME: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 0,
                                min: 0
                            },
                            LYRIC_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'lyricTypes',
                                defaultValue: 'lrc歌词'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'clearSongLyricCache',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '清除音乐[ID]的歌词缓存',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setEqualizerPreset',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置均衡器预设为[PRESET]',
                        arguments: {
                            PRESET: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'equalizerPresets',
                                defaultValue: 'default'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'adjustVolume',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '调整音量为[VOLUME]',
                        arguments: {
                            VOLUME: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 100,
                                min: 1,
                                max: 150
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getCurrentPlaybackTime',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前播放的[TIME_TYPE]',
                        arguments: {
                            TIME_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'timeTypes',
                                defaultValue: 'seconds'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getCurrentVolume',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前的音量',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getCurrentPreset',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前的预设',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getEqualizerData',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前的均衡器数据',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setEqualizerData',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置均衡器数据为[DATA]',
                        arguments: {
                            DATA: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '[0,0,0,0,0,0,0,0,0,0]'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'playMusicByIdWithAction',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '播放ID为[ID]的音乐并[ACTION]',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            ACTION: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'playbackActions',
                                defaultValue: 'play'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getCurrentMusicInfo',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前播放音乐的[INFO_TYPE]',
                        arguments: {
                            INFO_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'currentMusicInfoTypes',
                                defaultValue: 'ID'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getCurrentTimeLrcLyric',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前时间的lrc歌词',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setReverbEffect',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置混响音效，强度[强度]',
                        arguments: {
                            强度: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 50,
                                min: 0,
                                max: 100
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getEffectsProfileData',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '音效配置文件数据',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setEffectsFromProfile',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '从[音效配置文件数据]设置音效',
                        arguments: {
                            音效配置文件数据: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '{"reverb":{"wet":0.3,"dry":0.7,"roomSize":0.5,"damping":0.5}}'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'disableAllEffects',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '关闭所有音效',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'disableSpecificEffect',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '关闭音效[音效类型]',
                        arguments: {
                            音效类型: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'effectTypes',
                                defaultValue: '混响'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setEffectsPreset',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置音效预设为[PRESET_TEXT]',
                        arguments: {
                            PRESET_TEXT: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'effectsPresets',
                                defaultValue: 'default'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    
                    {
                        opcode: 'setAudioFilter',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置音频过滤器为[FILTER_TYPE]',
                        arguments: {
                            FILTER_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'audioFilterTypes',
                                defaultValue: '还原'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setVocalDetectionSensitivity',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置人声检测灵敏度为[SENSITIVITY]%',
                        arguments: {
                            SENSITIVITY: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 30,
                                min: 10,
                                max: 70
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setVocalFrequencyRange',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置人声频率范围为[MIN]到[MAX]Hz',
                        arguments: {
                            MIN: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 85,
                                min: 60,
                                max: 500
                            },
                            MAX: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 255,
                                min: 100,
                                max: 1000
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'isVocalDetected',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '检测到人声',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'isMusicPlaying',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '音乐播放状态',
                        blockIconURI: 统一图标
                    },
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: '人声处理'
                    },
                    
                    {
                        opcode: 'setVocalElimination',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '消除人声 [OPTION]',
                        arguments: {
                            OPTION: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'enableOptions',
                                defaultValue: '禁用'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'setAccompanimentElimination',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '消除伴奏 [OPTION]',
                        arguments: {
                            OPTION: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'enableOptions',
                                defaultValue: '禁用'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'isVocalElimination',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '是否正在消除人声',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'isAccompanimentElimination',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '是否正在消除伴奏',
                        blockIconURI: 统一图标
                    },
                    
                    {
                        opcode: 'setLyricSource',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '设置歌词音源为[SOURCE]',
                        arguments: {
                            SOURCE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'lyricSources',
                                defaultValue: 'netease'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'hasLyricTranslation',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: 'ID[ID]有歌词翻译吗？',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    
                    {
                        opcode: 'getSpecificLyricAroundTime',
                        blockType: Scratch.BlockType.REPORTER,
                        text: 'ID[ID]在[TIME]秒的[DIRECTION]第[NUMBER]个[LYRIC_TYPE]是',
                        arguments: {
                            ID: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '26092806'
                            },
                            TIME: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 60
                            },
                            DIRECTION: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'timeDirections',
                                defaultValue: '前'
                            },
                            NUMBER: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 1,
                                min: 1,
                                max: 20
                            },
                            LYRIC_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'lyricContentTypes',
                                defaultValue: '原歌词'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: '频谱相关'
                    },
                    
                    {
                        opcode: 'getAudioAnalysisData',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '分析当前音乐的 [type]，样本数 [NUM]',
                        tooltip: "音频分析【TYPE】【NUM】\n【TYPE】选择分析类型\n【NUM】输入采样点数（1-100）",
                        arguments: {
                            type: {
                                type: Scratch.ArgumentType.STRING,
                                menu: "audioAnalysisType"
                            },
                            NUM: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 20
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        blockType: Scratch.BlockType.LABEL,
                        text: '图片主题色获取'
                    },
                    
                    {
                        opcode: 'extractColors',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '从 [IMAGE] 提取颜色，精确度为 [THRESHOLD]',
                        arguments: {
                            IMAGE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '图片链接，http或https开头哦！'
                            },
                            THRESHOLD: {
                                type: Scratch.ArgumentType.NUMBER,
                                defaultValue: 10,
                                menu: 'thresholds'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                 
                    {
                        opcode: 'getPrimaryColor',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '主色调',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getSecondaryColor',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '辅助色调',
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getEdgeColor',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[EDGE] 边缘颜色',
                        arguments: {
                            EDGE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'edges'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getColorEffectValue',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[COLOR_TYPE] 的颜色特效值',
                        arguments: {
                            COLOR_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'colorTypes'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getBrightnessValue',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '[COLOR_TYPE] 的亮度特效值(若是太高可以降低)',
                        arguments: {
                            COLOR_TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                menu: 'colorTypes'
                            }
                        },
                        blockIconURI: 统一图标
                    },
                    {
                        opcode: 'getAutohueStatus',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '颜色获取状态',
                        blockIconURI: 统一图标
                    }
                ],
                //-----------下拉菜单----------
                menus: {
                    songFields: {
                        acceptReporters: false,
                        items: [
                            { text: "歌曲URL", value: "url" },
                            { text: "歌曲封面", value: "cover" },
                            { text: "歌曲名称", value: "song" },
                            { text: "歌手", value: "singer" },
                            { text: "专辑", value: "album" },
                            { text: "时长", value: "interval" },
                            { text: "大小", value: "size" },
                            { text: "音质", value: "quality" }
                        ]
                    },
                    searchFields: {
                        acceptReporters: false,
                        items: [
                            { text: "歌曲名称", value: "song" },
                            { text: "歌手", value: "singer" },
                            { text: "专辑", value: "album" },
                            { text: "发布时间", value: "time" },
                            { text: "音质", value: "quality" },
                            { text: "封面URL", value: "cover" },
                            { text: "歌曲ID", value: "id" }
                        ]
                    },
                    commentFields: {
                        acceptReporters: false,
                        items: [
                            { text: "用户名", value: "nickname" },
                            { text: "内容", value: "content" },
                            { text: "点赞数", value: "likedCount" },
                            { text: "评论时间", value: "timeStr" }
                        ]
                    },
                    musicSources: {
                        acceptReporters: false,
                        items: [
                            { text: "网易云音乐", value: "netease" },
                            { text: "QQ音乐", value: "tencent" }
                        ]
                    },
                    playbackActions: {
                        acceptReporters: false,
                        items: [
                            { text: "播放", value: "play" },
                            { text: "暂停", value: "pause" },
                            { text: "停止", value: "stop" }
                        ]
                    },
                    playbackRates: {
                        acceptReporters: false,
                        items: [
                            { text: "0.5x", value: "0.5" },
                            { text: "1x", value: "1" },
                            { text: "1.25x", value: "1.25" },
                            { text: "1.5x", value: "1.5" },
                            { text: "2x", value: "2" },
                            { text: "3x", value: "3" }
                        ]
                    },
                    frequencyBands: {
                        acceptReporters: false,
                        items: [
                            { text: '31Hz', value: 31 },
                            { text: '62Hz', value: 62 },
                            { text: '125Hz', value: 125 },
                            { text: '250Hz', value: 250 },
                            { text: '500Hz', value: 500 },
                            { text: '1kHz', value: 1000 },
                            { text: '2kHz', value: 2000 },
                            { text: '4kHz', value: 4000 },
                            { text: '8kHz', value: 8000 },
                            { text: '16kHz', value: 16000 }
                        ]
                    },
                    lyricTypes: {
                        acceptReporters: false,
                        items: [
                            { text: "lrc歌词", value: "lrc" },
                            { text: "yrc歌词", value: "yrc" },
                            { text: "翻译歌词", value: "trans" }
                        ]
                    },
                    equalizerPresets: {
                        acceptReporters: false,
                        items: [
                            { text: "默认", value: "default" },
                            { text: "环绕", value: "surround" },
                            { text: "古典", value: "classical" },
                            { text: "流行", value: "pop" },
                            { text: "摇滚", value: "rock" },
                            { text: "爵士", value: "jazz" },
                            { text: "重低音", value: "bass" },
                            { text: "高音增强", value: "treble" }
                        ]
                    },
                    timeTypes: {
                        acceptReporters: false,
                        items: [
                            { text: "秒", value: "seconds" },
                            { text: "分/秒", value: "minutesSeconds" }
                        ]
                    },
                    currentMusicInfoTypes: {
                        acceptReporters: false,
                        items: [
                            { text: "URL", value: "url" },
                            { text: "ID", value: "id" },
                            { text: "歌曲名称", value: "song" },
                            { text: "歌手", value: "singer" },
                            { text: "专辑", value: "album" },
                            { text: "时长", value: "interval" },
                            { text: "大小", value: "size" },
                            { text: "音质", value: "quality" }
                        ]
                    },
                    effectTypes: {
                        acceptReporters: false,
                        items: [
                            { text: "混响", value: "reverb" }
                        ]
                    },
                    effectsPresets: {
                        acceptReporters: false,
                        items: [
                            { text: "默认", value: "default" },
                            { text: "音乐厅", value: "concertHall" },
                            { text: "小房间", value: "smallRoom" },
                            { text: "录音室", value: "studio" }
                        ]
                    },
                    audioFilterTypes: {
                        acceptReporters: false,
                        items: [
                            { text: "过滤人声", value: "instrumental" },
                            { text: "过滤伴奏", value: "vocal" },
                            { text: "还原", value: "none" }
                        ]
                    },
                    enableOptions: {
                        items: ['启用', '禁用']
                    },
                    audioAnalysisType: {
                        acceptReporters: true,
                        items: ["频率域数据", "时域数据"]
                    },
                    lyricSources: [
                        { value: 'netease', text: '网易云音乐' },
                        { value: 'tencent', text: 'QQ音乐' }
                    ],
                    timeDirections: {
                        acceptReporters: false,
                        items: [
                            { text: '前', value: 'before' },
                            { text: '后', value: 'after' }
                        ]
                    },
                    lyricContentTypes: {
                        acceptReporters: false,
                        items: [
                            { text: '原歌词', value: 'original' },
                            { text: '翻译歌词', value: 'translation' }
                        ]
                    },
                       thresholds: [
                        { text: "精确", value: 5 },
                        { text: "还行", value: 10 },
                        { text: "模糊", value: 15 }
                    ],
                    edges: [
                        { text: "顶部", value: "顶部边缘色" },
                        { text: "右侧", value: "右侧边缘色" },
                        { text: "底部", value: "底部边缘色" },
                        { text: "左侧", value: "左侧边缘色" }
                    ],
                    colorTypes: [
                        { text: "主色调", value: "主色调" },
                        { text: "辅助色调", value: "辅助色调" },
                        { text: "顶部边缘色", value: "顶部边缘色" },
                        { text: "右侧边缘色", value: "右侧边缘色" },
                        { text: "底部边缘色", value: "底部边缘色" },
                        { text: "左侧边缘色", value: "左侧边缘色" }
                    ]
                    
                }
            };
        }

        //-----------定义----------
        getCache(key) {
            const cache = localStorage.getItem(key);
            return cache ? JSON.parse(cache) : {};
        }

        setCache(key, data) {
            localStorage.setItem(key, JSON.stringify(data));
        }

        manageCacheLimit(cacheKey) {
            const cache = this.getCache(cacheKey);
            const keys = Object.keys(cache);

            if (keys.length > this.cacheLimit) {
                const oldestKey = keys[0];
                delete cache[oldestKey];
                this.setCache(cacheKey, cache);
            }
        }

        async fetchWithRetry(url, retries = 1, delay = 2000) {
            try {
                const response = await fetch(url);
                const data = await response.json();
                
                if (data.code === 200) {
                    return data;
                }
                
                if (retries > 0) {
                    console.log(`API请求失败，将在${delay}ms后重试...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.fetchWithRetry(url, retries - 1, delay);
                }
                
                return { error: `API错误: ${data.message || '未知错误'}` };
                
            } catch (error) {
                if (retries > 0) {
                    console.log(`网络请求失败，将在${delay}ms后重试...`, error);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.fetchWithRetry(url, retries - 1, delay);
                }
                
                console.error('所有重试均失败:', error);
                return { error: '请求数据失败，服务器连接问题' };
            }
        }

        async fetchData(url) {
            return this.fetchWithRetry(url, 1, 2000);
        }

        async searchMusic(query) {
            const searchCacheKey = this.searchCacheKeys[this.currentSource];
            const searchCache = this.getCache(searchCacheKey);

            if (searchCache[query]) {
                return searchCache[query];
            }

            const encodedQuery = encodeURIComponent(query);
            const url = `${this.baseUrls[this.currentSource]}?word=${encodedQuery}`;
            const data = await this.fetchData(url);
            if (!data.error) {
                const dataWithoutUrl = {
                    ...data,
                    data: data.data.map(item => {
                        const { url, ...rest } = item;
                        return rest;
                    })
                };
                searchCache[query] = dataWithoutUrl;
                this.setCache(searchCacheKey, searchCache);
                this.manageCacheLimit(searchCacheKey);
            }
            return data;
        }

        async getMusicInfo(id) {
            const infoCacheKey = this.infoCacheKeys[this.currentSource];
            const infoCache = this.getCache(infoCacheKey);

            if (infoCache[id]) {
                return infoCache[id];
            }

            const url = `${this.baseUrls[this.currentSource]}?id=${id}`;
            const data = await this.fetchData(url);
            if (!data.error) {
                const { url, ...dataWithoutUrl } = data.data;
                const cachedData = {
                    ...data,
                    data: dataWithoutUrl
                };
                infoCache[id] = cachedData;
                this.setCache(infoCacheKey, infoCache);
                this.manageCacheLimit(infoCacheKey);
            }
            return data;
        }

        async getComments(id, forceRefresh = false) {
            const commentsCache = this.getCache(this.commentsCacheKey);

            if (!forceRefresh && commentsCache[id]) {
                return { data: commentsCache[id], error: null };
            }

            const url = `${this.commentsUrl}?id=${id}&limit=1`;
            const data = await this.fetchData(url);
            
            if (!data.error && data.hotComments && data.hotComments.length) {
                const hotComments = data.hotComments;
                commentsCache[id] = hotComments;
                this.setCache(this.commentsCacheKey, commentsCache);
                this.manageCacheLimit(this.commentsCacheKey);
                return { data: hotComments, error: null };
            }
            
            if (data && (!data.hotComments || data.hotComments.length === 0)) {
                delete commentsCache[id];
                this.setCache(this.commentsCacheKey, commentsCache);
                return { data: null, error: '无评论数据' };
            }
            
            return { data: null, error: data.error || '获取评论失败' };
        }

        clearCommentCache(args) {
            const id = args.ID;
            const commentsCache = this.getCache(this.commentsCacheKey);
            
            if (commentsCache[id]) {
                delete commentsCache[id];
                this.setCache(this.commentsCacheKey, commentsCache);
            }
        }

        async getCommentField(args) {
            const id = args.ID;
            let index = Math.floor(Number(args.INDEX)) - 1;
            index = Math.max(0, index);
            const field = args.FIELD;
            
            const result = await this.getComments(id);
            
            if (result.error) {
                return result.error;
            }
            
            if (!result.data || !result.data.length) {
                return '无评论数据';
            }
            
            if (index >= result.data.length) {
                return '评论索引超出范围';
            }
            
            const comment = result.data[index];
            
            switch(field) {
                case 'nickname':
                    return comment.user?.nickname || '未知用户';
                case 'content':
                    return comment.content || '无内容';
                case 'likedCount':
                    return comment.likedCount?.toString() || '0';
                case 'timeStr':
                    return comment.timeStr || '未知时间';
                default:
                    return `无${field}信息`;
            }
        }

        
        async fetchLyrics(id, source) {
            if (!this.lyricCache[id] || !this.lyricCache[id][source]) {
                try {
                    const response = await fetch(`https://api.vkeys.cn/v2/music/${source}/lyric?id=${id}`);
                    const data = await response.json();
                    
                    if (data.code === 200) {
                        if (!this.lyricCache[id]) {
                            this.lyricCache[id] = {};
                        }
                        
                        this.lyricCache[id][source] = {
                            original: this.parseLyrics(data.data.lrc, source),
                            translation: data.data.trans ? this.parseLyrics(data.data.trans, source) : null,
                            yrc: data.data.yrc ? this.parseLyrics(data.data.yrc, source) : null
                        };
                        
                        this.lastLyricId = id;
                        return true;
                    }
                } catch (error) {
                    console.error(`从${source}获取歌词出错:`, error);
                }
                return false;
            }
            return true;
        }

        parseLyrics(lyricsText, source) {
            if (!lyricsText) return [];
            
            const lines = lyricsText.split('\n');
            const result = [];
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                
                const timeMatch = line.match(/^\[(\d+),(\d+)\]/) || line.match(/^\[(\d+):(\d+)\.(\d+)\]/);
                if (timeMatch) {
                    
                    let startTime = timeMatch[3] 
                        ? parseInt(timeMatch[1]) * 60000 + parseInt(timeMatch[2]) * 1000 + parseInt(timeMatch[3])
                        : parseInt(timeMatch[1]);
                    
                    
                    let textMatch;
                    if (source === 'tencent') {
                        
                        textMatch = line.match(/\](.*)/);
                    } else {
                        
                        textMatch = line.match(/\)(.*)/) || line.match(/\](.*)/);
                    }
                    
                    if (textMatch) {
                        
                        const cleanText = textMatch[1]
                            .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, '')
                            .trim();
                        
                        if (cleanText) {
                            result.push({
                                startTime,
                                text: cleanText
                            });
                        }
                    }
                }
            }
            
            
            return result.sort((a, b) => a.startTime - b.startTime);
        }

        findLyricAtTime(lyrics, targetTime) {
            if (!lyrics || lyrics.length === 0) return {text: '', index: -1};
            
            const showEarly = 150;
            
            for (let i = 0; i < lyrics.length; i++) {
                const line = lyrics[i];
                
                if (targetTime + showEarly >= line.startTime && 
                    (i === lyrics.length - 1 || targetTime < lyrics[i + 1].startTime - showEarly)) {
                    return {text: line.text, index: i};
                }
            }
            
            return {text: '', index: -1};
        }

        async getSpecificLyricAroundTime(args) {
            const id = args.ID;
            const targetTime = args.TIME * 1000; 
            const direction = args.DIRECTION; 
            const number = Math.max(1, Math.min(20, Math.floor(args.NUMBER))); 
            const lyricType = args.LYRIC_TYPE; 
            const source = this.currentSource;
            
            
            if (!await this.fetchLyrics(id, source)) {
                return '获取歌词失败，请尝试使用“获取ID的歌词块”';
            }
            
            
            if (lyricType === 'translation' && !this.lyricCache[id][source].translation) {
                return '无翻译歌词';
            }
            
            
            const lyrics = lyricType === 'original' 
                ? (this.lyricCache[id][source].yrc || this.lyricCache[id][source].original)
                : this.lyricCache[id][source].translation;
            
            if (!lyrics || lyrics.length === 0) {
                return `无${lyricType === 'original' ? '原' : '翻译'}歌词数据`;
            }
            
            
            const targetLyric = this.findLyricAtTime(lyrics, targetTime);
            if (targetLyric.index === -1) {
                return '未找到对应时间的歌词';
            }
            
            
            let targetIndex;
            if (direction === 'before') {
                
                targetIndex = targetLyric.index - number;
            } else {
                
                targetIndex = targetLyric.index + number;
            }
            
            
            if (targetIndex < 0 || targetIndex >= lyrics.length) {
                return `不存在${direction === 'before' ? '前面' : '后面'}第${number}个歌词`;
            }
            
            
            return lyrics[targetIndex].text;
        }

        setLyricSource(args) {
            if (['netease', 'tencent'].includes(args.SOURCE)) {
                this.currentSource = args.SOURCE;
                this.saveState();
            }
        }

        async hasLyricTranslation(args) {
            const id = args.ID;
            const source = this.currentSource;
            
            if (await this.fetchLyrics(id, source)) {
                return this.lyricCache[id][source].translation !== null;
            }
            return false;
        }

        async getLyric(id, type, forceRefresh = false) {
            const lyricCacheKey = this.lyricCacheKeys[type];
            const lyricCache = this.getCache(lyricCacheKey);

            if (!forceRefresh && lyricCache[id]) {
                if (lyricCache[id] && lyricCache[id].trim() !== '') {
                    return lyricCache[id];
                }
            }

            const url = `${this.lyricUrl}?id=${id}`;
            const data = await this.fetchData(url);
            
            if (!data.error && data.data && data.data[type] && data.data[type].trim() !== '') {
                lyricCache[id] = data.data[type];
                this.setCache(lyricCacheKey, lyricCache);
                this.manageCacheLimit(lyricCacheKey);
                return data.data[type];
            }
            
            if (data.data && (!data.data[type] || data.data[type].trim() === '')) {
                delete lyricCache[id];
                this.setCache(lyricCacheKey, lyricCache);
            }
            
            return data.error || `无${this.getLyricTypeName(type)}信息`;
        }

        getLyricTypeName(type) {
            switch(type) {
                case 'lrc': return 'lrc歌词';
                case 'yrc': return 'yrc歌词';
                case 'trans': return '翻译歌词';
                default: return '歌词';
            }
        }

        async getFullSongLyric(args) {
            const id = args.ID;
            const lyricType = args.LYRIC_TYPE;
            
            let lyric = await this.getLyric(id, lyricType);
            
            if (lyric.startsWith('无') || lyric.startsWith('API错误')) {
                lyric = await this.getLyric(id, lyricType, true);
            }
            
            return lyric;
        }

        clearSongLyricCache(args) {
            const id = args.ID;
            
            Object.values(this.lyricCacheKeys).forEach(cacheKey => {
                const cache = this.getCache(cacheKey);
                if (cache[id]) {
                    delete cache[id];
                    this.setCache(cacheKey, cache);
                }
            });
            
            
            if (this.lyricCache[id]) {
                delete this.lyricCache[id];
            }
        }

        parseLrcForTime(lrcText, timeInSeconds) {
            const targetTime = Math.floor(timeInSeconds * 1000);
            let matchedLine = '';
            let previousLine = '';
            const lines = lrcText.split('\n');
            const timeRegex = /\[(\d+):(\d+\.\d+)\]/;
            
            for (const line of lines) {
                const match = line.match(timeRegex);
                if (match) {
                    const minutes = parseInt(match[1], 10);
                    const seconds = parseFloat(match[2]);
                    const lineTime = Math.floor((minutes * 60 + seconds) * 1000);
                    
                    if (lineTime <= targetTime) {
                        matchedLine = line.replace(timeRegex, '').trim();
                        previousLine = matchedLine;
                    } else {
                        return previousLine || `该时间点无${this.getLyricTypeName('lrc')}信息`;
                    }
                }
            }
            
            return matchedLine || `该时间点无${this.getLyricTypeName('lrc')}信息`;
        }

        parseYrcCharacters(yrcText) {
            const characters = [];
            const lines = yrcText.split('\n');
            
            const timeRegex = /\[(\d+),(\d+)\]/g;
            
            for (const line of lines) {
                if (!line.trim()) continue;
                
                const timeMatches = Array.from(line.matchAll(timeRegex));
                if (timeMatches.length === 0) continue;
                
                const content = line.replace(timeRegex, '').trim();
                
                if (timeMatches.length !== content.length) {
                    continue;
                }
                
                for (let i = 0; i < timeMatches.length && i < content.length; i++) {
                    const [, startStr, durationStr] = timeMatches[i];
                    const start = parseInt(startStr, 10);
                    const duration = parseInt(durationStr, 10);
                    const end = start + duration;
                    
                    characters.push({
                        char: content[i],
                        start,
                        end
                    });
                }
            }
            
            return characters;
        }

        findYrcCharacterAtTime(yrcText, timeInSeconds) {
            const targetTime = Math.floor(timeInSeconds * 1000);
            const characters = this.parseYrcCharacters(yrcText);
            let currentChar = null;
            
            for (const charInfo of characters) {
                if (targetTime >= charInfo.start && targetTime <= charInfo.end) {
                    currentChar = charInfo.char;
                    break;
                }
            }
            
            return currentChar || `该时间点无${this.getLyricTypeName('yrc')}信息`;
        }

        async getLyricAtTime(args) {
            const id = args.ID;
            const time = Number(args.TIME);
            const lyricType = args.LYRIC_TYPE;
            
            let fullLyric = await this.getLyric(id, lyricType);
            if (fullLyric.startsWith('无') || fullLyric.startsWith('API错误')) {
                fullLyric = await this.getLyric(id, lyricType, true);
            }
            
            if (fullLyric.startsWith('无') || fullLyric.startsWith('API错误') || fullLyric.startsWith('请求数据失败')) {
                return fullLyric;
            }
            
            switch (lyricType) {
                case 'yrc':
                    return this.findYrcCharacterAtTime(fullLyric, time);
                case 'lrc':
                case 'trans':
                default:
                    return this.parseLrcForTime(fullLyric, time);
            }
        }

        async searchAndGetUrl(args) {
            const query = args.QUERY;
            let index = Math.floor(Number(args.INDEX)) - 1;
            index = Math.max(0, index);
            const result = await this.searchMusic(query);
            if (result.error) return result.error;
            if (!result.data || !result.data.length) return '无搜索结果';
            if (index >= result.data.length) return '索引超出范围';
            const id = result.data[index].id;
            const info = await this.getMusicInfo(id);
            if (info.error) return info.error;
            return info.data.url || '无URL信息';
        }

        async getCoverUrlById(args) {
            const id = args.ID;
            const info = await this.getMusicInfo(id);
            if (info.error) return info.error;
            return info.data.cover || '无封面URL';
        }

        async getSongInfoById(args) {
            const id = args.ID;
            const field = args.FIELD;
            const info = await this.getMusicInfo(id);
            if (info.error) return info.error;
            if (field === 'url') {
                const url = `${this.baseUrls[this.currentSource]}?id=${id}`;
                const freshData = await this.fetchData(url);
                if (freshData.error) return freshData.error;
                return freshData.data.url || '无URL信息';
            }
            return info.data[field] || `无${field}信息`;
        }

        async getSearchResultField(args) {
            const query = args.QUERY;
            let index = Math.floor(Number(args.INDEX)) - 1;
            index = Math.max(0, index);
            const field = args.FIELD;
            const result = await this.searchMusic(query);
            if (result.error) return result.error;
            if (!result.data || !result.data.length) return '无搜索结果';
            if (index >= result.data.length) return '索引超出范围';
            if (field === 'url') {
                const id = result.data[index].id;
                const url = `${this.baseUrls[this.currentSource]}?id=${id}`;
                const freshData = await this.fetchData(url);
                if (freshData.error) return freshData.error;
                return freshData.data.url || '无URL信息';
            }
            return result.data[index][field] || `无${field}信息`;
        }

        async getSongLyric(args) {
            const id = args.ID;
            const lyricType = args.LYRIC_TYPE;
            return await this.getLyric(id, lyricType);
        }

        clearCache() {
            const cacheKeys = [
                this.searchCacheKeys.netease,
                this.infoCacheKeys.netease,
                this.searchCacheKeys.tencent,
                this.infoCacheKeys.tencent,
                this.lyricCacheKeys.lrc,
                this.lyricCacheKeys.yrc,
                this.lyricCacheKeys.trans,
                this.commentsCacheKey
            ];
            cacheKeys.forEach(key => {
                this.setCache(key, {});
            });
            
            
            this.lyricCache = {};
            this.lastLyricId = null;
        }

        changeMusicSource(args) {
            if (['netease', 'tencent'].includes(args.SOURCE)) {
                this.currentSource = args.SOURCE;
                this.saveState();
            } else {
                console.warn(`无效的数据源: ${args.SOURCE}`);
            }
        }

        async getUrlByIdAndQuality(args) {
            const id = args.ID;
            const quality = args.QUALITY;
            const url = `${this.baseUrls[this.currentSource]}?id=${id}&quality=${quality}`;
            const data = await this.fetchData(url);
            if (data.error) return data.error;
            return data.data.url || '无歌曲URL信息';
        }


        initVocalDetection() {
            this.analyserNode = this.audioContext.createAnalyser();
            this.analyserNode.fftSize = 2048;
            this.analyserNode.smoothingTimeConstant = 0.85;
            

            this.vocalFilterNode = this.audioContext.createBiquadFilter();
            this.vocalFilterNode.type = 'bandpass';
            this.vocalFilterNode.frequency.value = (this.vocalDetection.frequencyRange.min + this.vocalDetection.frequencyRange.max) / 2;
            this.vocalFilterNode.Q.value = 0.8;
            
            this.instrumentalFilterNode = this.audioContext.createBiquadFilter();
            this.instrumentalFilterNode.type = 'notch';
            this.instrumentalFilterNode.frequency.value = (this.vocalDetection.frequencyRange.min + this.vocalDetection.frequencyRange.max) / 2;
            this.instrumentalFilterNode.Q.value = 0.8;
            

            this.vocalGainNode = this.audioContext.createGain();
            this.instrumentalGainNode = this.audioContext.createGain();
            

            this.mixerNode = this.audioContext.createGain();
            

            this.vocalGainNode.gain.value = 1.0;
            this.instrumentalGainNode.gain.value = 1.0;
        }

        
        initVocalSeparationNodes() {
            this.channelSplitter = this.audioContext.createChannelSplitter(2);
            this.channelMerger = this.audioContext.createChannelMerger(2);
            
            this.leftGain = this.audioContext.createGain();
            this.rightGain = this.audioContext.createGain();
            
            this.leftFilter = this.audioContext.createBiquadFilter();
            this.leftFilter.type = 'notch';
            this.leftFilter.frequency.value = 170;
            this.leftFilter.Q.value = 1.5;
            
            this.rightFilter = this.audioContext.createBiquadFilter();
            this.rightFilter.type = 'notch';
            this.rightFilter.frequency.value = 170;
            this.rightFilter.Q.value = 1.5;
            
            this.masterFilter = this.audioContext.createBiquadFilter();
            this.masterFilter.type = 'notch';
            this.masterFilter.frequency.value = 330;
            this.masterFilter.Q.value = 1.2;
        }


        initEffectsNodes() {
            this.effectsMasterNode = this.audioContext.createGain();
            this.effectsMasterNode.gain.value = 1;
            
            this.reverbNode = this.audioContext.createConvolver();
            this.createReverbImpulseResponse(
                this.currentEffectsConfig.reverb.roomSize,
                this.currentEffectsConfig.reverb.damping
            );
            
            this.reverbDryNode = this.audioContext.createGain();
            this.reverbDryNode.gain.value = this.currentEffectsConfig.reverb.dry;
            
            this.reverbWetNode = this.audioContext.createGain();
            this.reverbWetNode.gain.value = this.currentEffectsConfig.reverb.wet;
            
            
            this.initVocalSeparationNodes();
            
            
            this.initVocalDetection();
            
            
            this.effectsMasterNode.connect(this.reverbDryNode);
            this.effectsMasterNode.connect(this.reverbNode);
            this.reverbNode.connect(this.reverbWetNode);

            this.reverbDryNode.connect(this.analyserNode);
            this.reverbWetNode.connect(this.analyserNode);
            
            this.analyserNode.connect(this.vocalFilterNode);
            this.analyserNode.connect(this.instrumentalFilterNode);
            
            this.vocalFilterNode.connect(this.vocalGainNode);
            this.instrumentalFilterNode.connect(this.instrumentalGainNode);
            
            this.vocalGainNode.connect(this.mixerNode);
            this.instrumentalGainNode.connect(this.mixerNode);
            
            this.mixerNode.connect(this.equalizer[0] || this.audioContext.destination);
            
            
            this.startVocalDetection();
        }

        frequencyToIndex(frequency) {
            const nyquist = this.audioContext.sampleRate / 2;
            return Math.round(frequency / nyquist * this.analyserNode.frequencyBinCount);
        }


        calculateSpectralCentroid() {
            const bufferLength = this.analyserNode.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analyserNode.getByteFrequencyData(dataArray);
            
            let sum = 0;
            let weightedSum = 0;
            const nyquist = this.audioContext.sampleRate / 2;
            
            for (let i = 0; i < bufferLength; i++) {
                const amplitude = dataArray[i] / 255;
                const frequency = (i / bufferLength) * nyquist;
                
                sum += amplitude;
                weightedSum += frequency * amplitude;
            }
            
            return sum > 0 ? weightedSum / sum : 0;
        }


        startVocalDetection() {
            if (this.detectionInterval) {
                clearInterval(this.detectionInterval);
            }
            
            this.vocalDetection.active = true;

            this.detectionInterval = setInterval(() => {
                if (!this.audioContext || this.audioContext.state !== 'running' || !this.analyserNode) {
                    return;
                }

                this.vocalDetection.spectralCentroid = this.calculateSpectralCentroid();
                
                const bufferLength = this.analyserNode.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                this.analyserNode.getByteFrequencyData(dataArray);

                const minIndex = this.frequencyToIndex(this.vocalDetection.frequencyRange.min);
                const maxIndex = this.frequencyToIndex(this.vocalDetection.frequencyRange.max);
                
                let vocalEnergy = 0;
                let totalEnergy = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const value = dataArray[i] / 255; 
                    totalEnergy += value;
                    
                    if (i >= minIndex && i <= maxIndex) {
                        vocalEnergy += value;
                    }
                }

                const vocalRatio = totalEnergy > 0 ? vocalEnergy / totalEnergy : 0;

                const adjustedThreshold = this.vocalDetection.threshold * 
                    (0.5 + (this.vocalDetection.spectralCentroid / 5000));

                const isVocal = vocalRatio > adjustedThreshold;

                this.vocalDetection.detectionHistory.push(isVocal ? 1 : 0);

                if (this.vocalDetection.detectionHistory.length > this.vocalDetection.historySize) {
                    this.vocalDetection.detectionHistory.shift();
                }
                
                const historySum = this.vocalDetection.detectionHistory.reduce((a, b) => a + b, 0);
                const vocalProbability = historySum / this.vocalDetection.detectionHistory.length;
                
                const sensitivityFactor = this.vocalDetection.sensitivity / 100;
                this.vocalDetection.isDetected = vocalProbability > (0.3 + 0.4 * (1 - sensitivityFactor));
                
                this.adjustFiltersDynamically(vocalRatio, isVocal);
                
            }, 30);
        }
        
        adjustFiltersDynamically(vocalRatio, isVocal) {
            if (!this.vocalFilterNode || !this.instrumentalFilterNode) return;
            
            const centerFreq = (this.vocalDetection.frequencyRange.min + this.vocalDetection.frequencyRange.max) / 2;
            
            if (isVocal) {
                this.vocalFilterNode.Q.value = Math.max(0.5, 1.2 - vocalRatio);
                this.instrumentalFilterNode.Q.value = Math.max(0.5, 1.2 - vocalRatio);
                
                const freqAdjustment = Math.sin(Date.now() * 0.001) * 20; 
                this.vocalFilterNode.frequency.value = centerFreq + freqAdjustment;
                this.instrumentalFilterNode.frequency.value = centerFreq + freqAdjustment;
               
                this.vocalGainNode.gain.value = 1.2 + (vocalRatio * 0.8);
                this.instrumentalGainNode.gain.value = 1.2 + ((1 - vocalRatio) * 0.8);
            } else {
                this.vocalFilterNode.Q.value = 0.8;
                this.instrumentalFilterNode.Q.value = 0.8;
                this.vocalFilterNode.frequency.value = centerFreq;
                this.instrumentalFilterNode.frequency.value = centerFreq;
                this.vocalGainNode.gain.value = 1.0;
                this.instrumentalGainNode.gain.value = 1.0;
            }
        }

        stopVocalDetection() {
            if (this.detectionInterval) {
                clearInterval(this.detectionInterval);
                this.detectionInterval = null;
            }
            this.vocalDetection.active = false;
            this.vocalDetection.detectionHistory = [];
        }

        createReverbImpulseResponse(roomSize = 0.5, damping = 0.5) {
            const sampleRate = this.audioContext.sampleRate;
            const length = sampleRate * 3;
            const impulse = this.audioContext.createBuffer(2, length, sampleRate);
            const left = impulse.getChannelData(0);
            const right = impulse.getChannelData(1);
            
            const decay = 1 - (roomSize * 0.8);
            
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                const dampFactor = Math.exp(-t * 5 * (1 - damping));
                
                left[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay) * dampFactor;
                right[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay) * dampFactor;
            }
            
            this.reverbNode.buffer = impulse;
        }

        initEqualizer() {
            if (this.equalizer.length > 0) {
                this.equalizer[this.equalizer.length - 1].disconnect();
            }
            
            this.equalizer = [];
            
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.currentVolume / 100;
            
            this.equalizerFrequencies.forEach((freq, index) => {
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1.414;
                filter.gain.value = 0;
                
                this.equalizer.push(filter);
            });
            
            for (let i = 0; i < this.equalizer.length - 1; i++) {
                this.equalizer[i].connect(this.equalizer[i + 1]);
            }
            
            this.equalizer[this.equalizer.length - 1].connect(this.audioContext.destination);
            
            this.initEffectsNodes();
        }

        
        disconnectAllNodes() {
            if (this.channelSplitter) this.channelSplitter.disconnect();
            if (this.leftFilter) this.leftFilter.disconnect();
            if (this.rightFilter) this.rightFilter.disconnect();
            if (this.leftGain) this.leftGain.disconnect();
            if (this.rightGain) this.rightGain.disconnect();
            if (this.channelMerger) this.channelMerger.disconnect();
            if (this.masterFilter) this.masterFilter.disconnect();
            if (this.gainNode) this.gainNode.disconnect();
        }

        
        setupNormalAudioRouting() {
            this.disconnectAllNodes();
            
            this.channelSplitter.connect(this.channelMerger, 0, 0);
            this.channelSplitter.connect(this.channelMerger, 1, 1);
            this.channelMerger.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            this.gainNode.gain.value = 1.0;
        }
        
        
        setupVocalEliminationRouting() {
            this.disconnectAllNodes();
            
            this.leftGain.gain.value = 1.2;
            this.rightGain.gain.value = -1.2;
            
            this.channelSplitter.connect(this.leftFilter, 0);
            this.channelSplitter.connect(this.rightFilter, 1);
            
            this.leftFilter.connect(this.leftGain);
            this.rightFilter.connect(this.rightGain);
            
            this.leftGain.connect(this.channelMerger, 0, 0);
            this.rightGain.connect(this.channelMerger, 0, 0);
            this.leftGain.connect(this.channelMerger, 0, 1);
            this.rightGain.connect(this.channelMerger, 0, 1);
            
            this.channelMerger.connect(this.masterFilter);
            this.masterFilter.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            this.gainNode.gain.value = 2.5;
        }
        
        
        setupAccompanimentEliminationRouting() {
            this.disconnectAllNodes();
            
            this.leftGain.gain.value = 0.7;
            this.rightGain.gain.value = 0.7;
            
            const commonSignalGain = this.audioContext.createGain();
            commonSignalGain.gain.value = 1.0;
            
            this.channelSplitter.connect(this.leftFilter, 0);
            this.channelSplitter.connect(this.rightFilter, 1);
            
            this.leftFilter.connect(this.leftGain);
            this.rightFilter.connect(this.rightGain);
            
            this.leftGain.connect(commonSignalGain);
            this.rightGain.connect(commonSignalGain);
            
            commonSignalGain.connect(this.channelMerger, 0, 0);
            commonSignalGain.connect(this.channelMerger, 0, 1);
            
            this.channelMerger.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            this.gainNode.gain.value = 2.0;
        }

        updateAudioConnections() {
            if (!this.audioContext || !this.sourceNode) return;

            this.sourceNode.disconnect();

            switch (this.vocalSeparation.effect) {
                case 'vocal_elimination':
                    this.sourceNode.connect(this.channelSplitter);
                    this.setupVocalEliminationRouting();
                    break;
                case 'accompaniment_elimination':
                    this.sourceNode.connect(this.channelSplitter);
                    this.setupAccompanimentEliminationRouting();
                    break;
                default:
                    this.sourceNode.connect(this.gainNode);
                    this.gainNode.connect(this.effectsMasterNode);
                    this.setupNormalAudioRouting();
            }

            this.updateFilterGains();

            this._setupAudioAnalyser();
        }

        updateFilterGains() {
            if (!this.vocalGainNode || !this.instrumentalGainNode) return;
            
            switch (this.audioFilterMode) {
                case 'instrumental': 
                    this.vocalGainNode.gain.value = 0.01; 
                    this.instrumentalGainNode.gain.value = 2.0; 
                    break;
                case 'vocal':
                    this.vocalGainNode.gain.value = 2.0; 
                    this.instrumentalGainNode.gain.value = 0.1; 

                    this.equalizer.forEach((filter, index) => {
                        if (this.equalizerFrequencies[index] >= 85 && this.equalizerFrequencies[index] <= 255) {
                            filter.gain.value = Math.min(12, filter.gain.value + 3);
                        } else if (this.equalizerFrequencies[index] < 85) {
                            filter.gain.value = Math.max(-12, filter.gain.value - 4);
                        }
                    });
                    break;
                default: 
                    this.vocalGainNode.gain.value = 1.0;
                    this.instrumentalGainNode.gain.value = 1.0;
                    if (this.currentPreset !== 'custom') {
                        this.equalizerPresets[this.currentPreset].forEach((gain, index) => {
                            if (this.equalizer[index]) {
                                this.equalizer[index].gain.value = gain;
                            }
                        });
                    }
            }
        }

        async setEqualizerPreset(args) {
            if (Object.keys(this.equalizerPresets).includes(args.PRESET)) {
                this.currentPreset = args.PRESET;
                
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.initEqualizer();
                } else if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                this.equalizerPresets[this.currentPreset].forEach((gain, index) => {
                    if (this.equalizer[index]) {
                        this.equalizer[index].gain.value = gain;
                    }
                });
                
                this.saveState();
            } else {
                console.warn(`无效的均衡器预设: ${args.PRESET}`);
            }
        }

        async setEffectsPreset(args) {
            const presetKey = args.PRESET_TEXT;
            if (Object.keys(this.effectsPresets).includes(presetKey)) {
                this.currentEffectsConfig = JSON.parse(JSON.stringify(this.effectsPresets[presetKey]));
                
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.initEqualizer();
                } else if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                if (this.reverbDryNode && this.reverbWetNode) {
                    this.reverbDryNode.gain.value = this.currentEffectsConfig.reverb.dry;
                    this.reverbWetNode.gain.value = this.currentEffectsConfig.reverb.wet;
                    this.createReverbImpulseResponse(
                        this.currentEffectsConfig.reverb.roomSize,
                        this.currentEffectsConfig.reverb.damping
                    );
                }
                
                this.effectsEnabled.reverb = true;
                this.updateAudioConnections();
                this.saveState();
            } else {
                console.warn(`无效的音效预设: ${presetKey}`);
            }
        }

        async setReverbEffect(args) {
            let intensity = Number(args.强度);
            intensity = Math.max(0, Math.min(100, intensity)) / 100;
            
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.initEqualizer();
            } else if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.currentEffectsConfig.reverb = {
                ...this.currentEffectsConfig.reverb,
                wet: intensity,
                dry: 1 - intensity
            };
            
            if (this.reverbDryNode && this.reverbWetNode) {
                this.reverbDryNode.gain.value = this.currentEffectsConfig.reverb.dry;
                this.reverbWetNode.gain.value = this.currentEffectsConfig.reverb.wet;
            }
            
            this.effectsEnabled.reverb = intensity > 0;
            this.updateAudioConnections();
            this.saveState();
        }

        getEffectsProfileData() {
            return JSON.stringify(this.currentEffectsConfig);
        }

        async setEffectsFromProfile(args) {
            try {
                const profileData = JSON.parse(args.音效配置文件数据);
                
                if (typeof profileData !== 'object' || profileData === null) {
                    console.error('音效配置数据格式错误');
                    return;
                }
                
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.initEqualizer();
                } else if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }
                
                this.currentEffectsConfig = {
                    ...this.currentEffectsConfig,
                    ...profileData
                };
                
                if (this.currentEffectsConfig.reverb && this.reverbDryNode && this.reverbWetNode) {
                    this.reverbDryNode.gain.value = this.currentEffectsConfig.reverb.dry || 0.7;
                    this.reverbWetNode.gain.value = this.currentEffectsConfig.reverb.wet || 0.3;
                    
                    this.createReverbImpulseResponse(
                        this.currentEffectsConfig.reverb.roomSize || 0.5,
                        this.currentEffectsConfig.reverb.damping || 0.5
                    );
                    
                    this.effectsEnabled.reverb = this.currentEffectsConfig.reverb.wet > 0;
                }
                
                this.updateAudioConnections();
                this.saveState();
                
            } catch (error) {
                console.error('解析音效配置数据失败:', error);
            }
        }

        async disableAllEffects() {
            if (!this.audioContext) return;
            
            Object.keys(this.effectsEnabled).forEach(effect => {
                this.effectsEnabled[effect] = false;
            });
            
            this.audioFilterMode = 'none';
            this.vocalSeparation.effect = 'none';
            this.updateAudioConnections();
            this.saveState();
        }

        async disableSpecificEffect(args) {
            const effectType = args.音效类型;
            
            if (!this.audioContext || !this.effectsEnabled.hasOwnProperty(effectType)) return;
            
            this.effectsEnabled[effectType] = false;
            this.updateAudioConnections();
            this.saveState();
        }

        async setAudioFilter(args) {
            const filterType = args.FILTER_TYPE;
            
            if (!['none', 'vocal', 'instrumental'].includes(filterType)) {
                console.warn(`无效的过滤类型: ${filterType}`);
                return;
            }
            
            this.audioFilterMode = filterType;
            
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.initEqualizer();
            } else if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            this.updateFilterGains();
            this.saveState();
        }

        
        setVocalElimination(args) {
            if (!this.audioContext) {
                console.warn('请先播放音乐再使用此功能');
                return;
            }
            
            if (args.OPTION === '启用') {
                this.vocalSeparation.effect = 'vocal_elimination';
            } else if (this.vocalSeparation.effect === 'vocal_elimination') {
                this.vocalSeparation.effect = 'none';
            }
            
            this.updateAudioConnections();
            this.saveState();
        }
        
        setAccompanimentElimination(args) {
            if (!this.audioContext) {
                console.warn('请先播放音乐再使用此功能');
                return;
            }
            
            if (args.OPTION === '启用') {
                this.vocalSeparation.effect = 'accompaniment_elimination';
            } else if (this.vocalSeparation.effect === 'accompaniment_elimination') {
                this.vocalSeparation.effect = 'none';
            }
            
            this.updateAudioConnections();
            this.saveState();
        }

        isVocalElimination() {
            return this.vocalSeparation.effect === 'vocal_elimination';
        }
        
        isAccompanimentElimination() {
            return this.vocalSeparation.effect === 'accompaniment_elimination';
        }

        setVocalDetectionSensitivity(args) {
            let sensitivity = Number(args.SENSITIVITY);
            sensitivity = Math.max(10, Math.min(70, sensitivity));
            
            this.vocalDetection.sensitivity = sensitivity;
            this.vocalDetection.threshold = sensitivity / 100;
            
            this.saveState();
        }

        setVocalFrequencyRange(args) {
            let min = Number(args.MIN);
            let max = Number(args.MAX);
            
            min = Math.max(60, Math.min(500, min));
            max = Math.max(Math.min(min + 50, 1000), max);
            
            this.vocalDetection.frequencyRange = { min, max };
            
            if (this.vocalFilterNode && this.instrumentalFilterNode) {
                const centerFreq = (min + max) / 2;
                this.vocalFilterNode.frequency.value = centerFreq;
                this.instrumentalFilterNode.frequency.value = centerFreq;
            }
            
            this.saveState();
        }

        isVocalDetected() {
            return this.vocalDetection.active && this.vocalDetection.isDetected;
        }

        isMusicPlaying() {
            if (!this.audioElement) {
                return false;
            }
            return !this.audioElement.paused;
        }

        async playMusicFromUrl(args) {
            const url = args.URL;
            this.stopMusic();
            
            try {
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.initEqualizer();
                } else if (this.audioContext.state === 'suspended') {
                    await this.audioContext.resume();
                }

                this.audioElement = new Audio(url);
                this.audioElement.crossOrigin = 'anonymous';
                this.audioElement.playbackRate = parseFloat(this.currentPlaybackRate);
                
                this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
                this.updateAudioConnections();
                
                await this.audioElement.play();
                async function playMusicFromUrl(args) {
                    const url = args.URL;
                    this.stopMusic();

                    try {
                        if (!this.audioContext) {
                            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                            this.initEqualizer();
                        } else if (this.audioContext.state === 'suspended') {
                            await this.audioContext.resume();
                        }

                        this.audioElement = new Audio(url);
                        this.audioElement.crossOrigin = 'anonymous';
                        this.audioElement.playbackRate = parseFloat(this.currentPlaybackRate);

                        this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
                        this.updateAudioConnections();

                        this._setupAudioAnalyser();

                        await this.audioElement.play();
                    } catch (error) {
                        console.error('播放音乐失败:', error);
                    }
                }
            } catch (error) {
                console.error('播放音乐失败:', error);
            }
        }

        async controlMusicPlayback(args) {
            const action = args.ACTION;
            
            if (!this.audioElement) {
                if (action === 'play') {
                    console.warn('请先通过"播放URL音乐"块加载音乐');
                }
                return;
            }
            
            try {
                switch (action) {
                    case 'play':
                        if (this.audioContext && this.audioContext.state === 'suspended') {
                            await this.audioContext.resume();
                        }
                        await this.audioElement.play();
                        break;
                    case 'pause':
                        this.audioElement.pause();
                        break;
                    case 'stop':
                        this.audioElement.pause();
                        this.audioElement.currentTime = 0;
                        break;
                    default:
                        console.warn(`无效的播放控制动作: ${action}`);
                }
            } catch (error) {
                console.error('控制音乐播放失败:', error);
            }
        }


        setPlaybackRate(args) {
            if (['0.5', '1', '1.25', '1.5', '2', '3'].includes(args.SPEED)) {
                this.currentPlaybackRate = args.SPEED;
                if (this.audioElement) {
                    this.audioElement.playbackRate = parseFloat(this.currentPlaybackRate);
                }
                this.saveState();
            } else {
                console.warn(`无效的播放倍速: ${args.SPEED}`);
            }
        }

        seekToTime(args) {
            const time = Number(args.TIME);
            if (this.audioElement) {
                const validTime = Math.max(0, Math.min(time, this.audioElement.duration || Infinity));
                this.audioElement.currentTime = validTime;
            } else {
                console.warn('没有正在播放的音乐，无法跳转时间');
            }
        }

        adjustFrequency(args) {
            if (!this.audioContext) return;
            
            const frequency = Number(args.FREQUENCY);
            let gain = Number(args.GAIN);
            
            gain = Math.max(-12, Math.min(12, gain));
            
            const filter = this.equalizer.find(f => f.frequency.value === frequency);
            if (filter) {
                filter.gain.value = gain;
                this.currentPreset = 'custom';
                this.saveState();
            } else {
                console.warn(`无效的频率: ${frequency}`);
            }
        }

        stopMusic() {
            if (this.audioElement) {
                this.audioElement.pause();
                this.audioElement.currentTime = 0;
            }
            if (this.blockAnalyserNode) {
                this.blockAnalyserNode.disconnect();
                this.blockAnalyserNode = null;
            }
        }

        adjustVolume(args) {
            let volume = Number(args.VOLUME);
            volume = Math.max(1, Math.min(150, volume));
            this.currentVolume = volume;
            
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                this.initEqualizer();
            }
            
            const gainValue = volume / 100;
            this.gainNode.gain.value = gainValue;
            this.saveState();
        }

        getCurrentPlaybackTime(args) {
            if (!this.audioElement) {
                return args.TIME_TYPE === 'seconds' ? '0' : '0:00';
            }
            
            const currentTime = this.audioElement.currentTime || 0;
            
            if (args.TIME_TYPE === 'seconds') {
                return Math.floor(currentTime).toString();
            } else {
                const minutes = Math.floor(currentTime / 60);
                const seconds = Math.floor(currentTime % 60);
                return `${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        }

        getCurrentVolume() {
            return this.currentVolume.toString();
        }

        getCurrentPreset() {
            const presetNames = {
                'default': '默认',
                'surround': '环绕',
                'classical': '古典',
                'pop': '流行',
                'rock': '摇滚',
                'jazz': '爵士',
                'bass': '重低音',
                'treble': '高音增强',
                'custom': '自定义'
            };
            
            return presetNames[this.currentPreset] || this.currentPreset;
        }

        getEffectsPresetName(presetKey) {
            const presetNames = {
                'default': '默认',
                'concertHall': '音乐厅',
                'smallRoom': '小房间',
                'studio': '录音室'
            };
            
            return presetNames[presetKey] || presetKey;
        }

        getEqualizerData() {
            if (!this.equalizer || this.equalizer.length === 0) {
                return JSON.stringify(this.equalizerPresets.default);
            }
            
            const data = this.equalizer.map(filter => {
                return Math.round(filter.gain.value * 10) / 10;
            });
            
            return JSON.stringify(data);
        }

        setEqualizerData(args) {
            try {
                const data = JSON.parse(args.DATA);
                
                if (!Array.isArray(data) || data.length !== 10) {
                    console.error('均衡器数据格式错误，应为包含10个数字的数组');
                    return;
                }
                
                if (!this.audioContext) {
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    this.initEqualizer();
                } else if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
                
                data.forEach((gain, index) => {
                    if (this.equalizer[index]) {
                        const limitedGain = Math.max(-12, Math.min(12, gain));
                        this.equalizer[index].gain.value = limitedGain;
                    }
                });
                
                this.currentPreset = 'custom';
                this.saveState();
                
            } catch (error) {
                console.error('解析均衡器数据失败:', error);
            }
        }

        async playMusicByIdWithAction(args) {
            const id = args.ID;
            const action = args.ACTION;
            
            try {
                const url = `${this.baseUrls[this.currentSource]}?id=${id}`;
                const data = await this.fetchData(url);
                
                if (data.error) {
                    console.error('获取音乐信息失败:', data.error);
                    return;
                }
                
                this.currentMusicInfo = {
                    id: id,
                    url: data.data.url,
                    song: data.data.song,
                    singer: data.data.singer,
                    album: data.data.album,
                    interval: data.data.interval,
                    size: data.data.size,
                    quality: data.data.quality
                };
                
                if (action === 'play') {
                    await this.playMusicFromUrl({ URL: data.data.url });
                } else if (action === 'pause' || action === 'stop') {
                    await this.controlMusicPlayback({ ACTION: action });
                } else {
                    console.warn(`无效的播放控制动作: ${action}`);
                }
            } catch (error) {
                console.error('播放ID音乐失败:', error);
            }
        }

        getCurrentMusicInfo(args) {
            const infoType = args.INFO_TYPE;
            
            if (!this.currentMusicInfo.id) {
                return `无当前播放的音乐${infoType}`;
            }
            
            return this.currentMusicInfo[infoType] || `无当前播放音乐的${infoType}信息`;
        }

        async getCurrentTimeLrcLyric() {
            if (!this.currentMusicInfo.id || !this.audioElement) {
                return '无当前播放的音乐';
            }
            
            const currentTime = this.audioElement.currentTime || 0;
            
            let lrcLyric = await this.getLyric(this.currentMusicInfo.id, 'lrc');
            
            if (lrcLyric.startsWith('无') || lrcLyric.startsWith('API错误')) {
                lrcLyric = await this.getLyric(this.currentMusicInfo.id, 'lrc', true);
            }
            
            if (lrcLyric.startsWith('无') || lrcLyric.startsWith('API错误') || lrcLyric.startsWith('请求数据失败')) {
                return lrcLyric;
            }
            
            return this.parseLrcForTime(lrcLyric, currentTime);
        }
        _setupAudioAnalyser() {
            if (!this.audioContext || !this.gainNode) {
                console.warn('音频上下文或增益节点未初始化');
                return false;
            }

            if (this.blockAnalyserNode) {
                this.blockAnalyserNode.disconnect();
                this.blockAnalyserNode = null;
            }

            try {
                this.blockAnalyserNode = this.audioContext.createAnalyser();
                this.blockAnalyserNode.fftSize = 512;
                this.blockAnalyserNode.smoothingTimeConstant = 0.8;

                this.gainNode.connect(this.blockAnalyserNode);

                console.log('音频分析器设置成功');
                return true;
            } catch (error) {
                console.error('设置音频分析器失败:', error);
                return false;
            }
        }

        getAudioAnalysisData(args) {
            const type = args.type || '频率域数据';
            const num = Math.max(1, Math.min(100, Number(args.NUM) || 20));

            if (!this.audioElement) {
                return JSON.stringify(new Array(num).fill(0));
            }

            if (this.audioElement.paused || this.audioElement.ended) {
                return JSON.stringify(new Array(num).fill(0));
            }

            if (!this.blockAnalyserNode) {
                if (!this._setupAudioAnalyser()) {
                    return this._getMockAudioData(type, num);
                }
            }

            try {
                let dataArray;
                if (type === '频率域数据') {
                    dataArray = new Uint8Array(this.blockAnalyserNode.frequencyBinCount);
                    this.blockAnalyserNode.getByteFrequencyData(dataArray);
                } else {
                    dataArray = new Uint8Array(this.blockAnalyserNode.fftSize);
                    this.blockAnalyserNode.getByteTimeDomainData(dataArray);
                }

                const hasValidData = dataArray.some(value => value > 0);
                if (!hasValidData) {
                    console.log('音频数据无效（全为0），返回模拟数据');
                    return this._getMockAudioData(type, num);
                }

                const simplifiedArray = this._simplifyAudioAnalysisData(dataArray, num);
                return JSON.stringify(simplifiedArray);

            } catch (error) {
                console.error('音频分析错误:', error);
                return this._getMockAudioData(type, num);
            }
        }

        _simplifyAudioAnalysisData(dataArray, num) {
            const simplifiedArray = new Array(num).fill(0);
            const segmentLength = Math.floor(dataArray.length / num);

            for (let i = 0; i < num; i++) {
                let sum = 0;
                const start = i * segmentLength;
                const end = Math.min(start + segmentLength, dataArray.length);
                const count = end - start;

                if (count > 0) {
                    for (let j = start; j < end; j++) {
                        sum += dataArray[j];
                    }
                    simplifiedArray[i] = Math.round(sum / count);
                }
            }
            return simplifiedArray;
        }

        _getMockAudioData(type, num) {
            const data = new Array(num);

            if (type === '频率域数据') {
                for (let i = 0; i < num; i++) {
                    const baseValue = Math.random() * 50;
                    const peak = Math.sin(i / num * Math.PI) * 100 + Math.random() * 50;
                    data[i] = Math.min(255, Math.max(0, Math.round(baseValue + peak)));
                }
            } else {
                for (let i = 0; i < num; i++) {
                    const value = 128 + Math.sin(i / num * Math.PI * 4) * 50 + (Math.random() - 0.5) * 20;
                    data[i] = Math.min(255, Math.max(0, Math.round(value)));
                }
            }

            return JSON.stringify(data);
        }
    }

    Scratch.extensions.register(new EnhancedMusicSearchExtension());
})();
    