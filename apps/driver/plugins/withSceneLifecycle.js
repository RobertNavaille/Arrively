// iOS 27 refuses to launch apps that don't use the UIScene life cycle
// ("UIScene life cycle is required for apps built with this SDK").
// Expo ships ExpoAppSceneDelegate for this, but the generated app doesn't use
// it yet, so wire it up: declare the scene in Info.plist and let the scene
// delegate (not the app delegate) create the window and start React Native.
const { withInfoPlist, withAppDelegate } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE,
          },
        ],
      },
    };
    return c;
  });

  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== 'swift') {
      throw new Error('withSceneLifecycle expects a Swift AppDelegate');
    }
    let src = c.modResults.contents;

    // The scene delegate finds the factory through this protocol.
    if (!src.includes('ExpoReactNativeFactoryProvider')) {
      src = src.replace(
        /class AppDelegate: ExpoAppDelegate\s*\{/,
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      );
    }

    // Remove the app delegate's own window + startReactNative; the scene
    // delegate does that now (doing both would start React Native twice).
    src = src.replace(
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/,
      '\n',
    );

    if (!src.includes('ExpoReactNativeFactoryProvider') || src.includes('factory.startReactNative(')) {
      throw new Error('withSceneLifecycle: AppDelegate.swift did not match the expected template');
    }
    c.modResults.contents = src;
    return c;
  });
};
