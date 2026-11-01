import { Vibration, Platform } from 'react-native';

let Sound: any = null;
try {
  Sound = require('react-native-sound');
  if (Sound && Sound.setCategory) {
    // Set to 'Ring' category so it plays on Android's STREAM_RING at full alert volume
    Sound.setCategory('Ring', false);
  }
} catch (e) {
  console.log('[SoundService] react-native-sound initialization notice:', e);
}

class SoundServiceManager {
  private activeSound: any = null;
  private isAlertPlaying: boolean = false;

  /**
   * Start looping sound alert and vibration for incoming orders / requests
   */
  public playIncomingOrderAlert() {
    if (this.isAlertPlaying) return;
    this.isAlertPlaying = true;

    // 1. Continuous pulsing vibration
    try {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 1000, 800, 1000, 800, 1000], true);
      } else {
        Vibration.vibrate([1000, 1000], true);
      }
    } catch (e) {
      console.warn('[SoundService] Vibration error:', e);
    }

    // 2. Play continuous looping audio sound
    if (!Sound) {
      console.log('[SoundService] react-native-sound not available, vibration active');
      return;
    }

    try {
      this.stopSoundOnly();

      const playInstance = (soundInstance: any) => {
        if (!soundInstance) return;
        this.activeSound = soundInstance;
        try {
          if (soundInstance.setSpeakerphoneOn) {
            soundInstance.setSpeakerphoneOn(true);
          }
          soundInstance.setNumberOfLoops(-1); // Infinite loop until stopped
          soundInstance.setVolume(1.0);
          soundInstance.play((success: boolean) => {
            if (!success) {
              console.warn('[SoundService] Audio playback did not succeed, trying fallback');
            } else if (this.isAlertPlaying) {
              // Replay if loop finished but alert is still active
              try {
                soundInstance.play();
              } catch (_) {}
            }
          });
          console.log('🔊 [SoundService] Ringtone started successfully in continuous loop');
        } catch (playErr) {
          console.warn('[SoundService] playInstance error:', playErr);
        }
      };

      const tryRawResource = () => {
        try {
          // On Android res/raw, file names are identifiers without extension
          const rawSound = new Sound('whats_ringtone', Sound.MAIN_BUNDLE, (rawErr: any) => {
            if (!rawErr && rawSound) {
              playInstance(rawSound);
              return;
            }
            console.log('[SoundService] whats_ringtone raw failed, trying tone:', rawErr);
            const toneSound = new Sound('tone', Sound.MAIN_BUNDLE, (tErr: any) => {
              if (!tErr && toneSound) {
                playInstance(toneSound);
                return;
              }
              console.log('[SoundService] tone raw failed, trying with extension:', tErr);
              const extSound = new Sound('whats_ringtone.mp3', Sound.MAIN_BUNDLE, (extErr: any) => {
                if (!extErr && extSound) {
                  playInstance(extSound);
                  return;
                }
                console.log('[SoundService] extSound failed, trying asset require:', extErr);
                tryAssetRequire();
              });
            });
          });
        } catch (rErr) {
          tryAssetRequire();
        }
      };

      const tryAssetRequire = () => {
        try {
          const assetSound = new Sound(require('../tone/whats_ringtone.mp3'), (assetErr: any) => {
            if (!assetErr && assetSound) {
              playInstance(assetSound);
              return;
            }
            try {
              const bannerSound = new Sound(require('../banner/tone.mp3'), (bErr: any) => {
                if (!bErr && bannerSound) {
                  playInstance(bannerSound);
                } else {
                  console.warn('[SoundService] All sound loading attempts failed');
                }
              });
            } catch (_) {}
          });
        } catch (_) {}
      };

      if (Platform.OS === 'android') {
        tryRawResource();
      } else {
        tryAssetRequire();
      }
    } catch (e) {
      console.warn('[SoundService] Exception while playing incoming order sound:', e);
    }
  }

  /**
   * Stop incoming order sound alert and cancel vibration
   */
  public stopIncomingOrderAlert() {
    this.isAlertPlaying = false;
    try {
      Vibration.cancel();
    } catch (e) {}
    this.stopSoundOnly();
  }

  private stopSoundOnly() {
    if (this.activeSound) {
      try {
        const soundToStop = this.activeSound;
        this.activeSound = null;
        soundToStop.stop(() => {
          try {
            soundToStop.release();
          } catch (e) {}
        });
      } catch (e) {
        try {
          this.activeSound?.release();
        } catch (relErr) {}
        this.activeSound = null;
      }
    }
  }

  /**
   * Short notification beep
   */
  public playShortBeep() {
    try {
      Vibration.vibrate(300);
      if (Sound) {
        const beep = new Sound('whats_ringtone', Sound.MAIN_BUNDLE, (error: any) => {
          if (!error) {
            beep.setVolume(1.0);
            beep.play(() => beep.release());
          } else {
            const rawBeep = new Sound('tone', Sound.MAIN_BUNDLE, (rawErr: any) => {
              if (!rawErr) {
                rawBeep.setVolume(1.0);
                rawBeep.play(() => rawBeep.release());
              }
            });
          }
        });
      }
    } catch (e) {}
  }
}

export const SoundService = new SoundServiceManager();
export default SoundService;
