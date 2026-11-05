// react-native-ios-context-menu (Apple's context menu around a row) uses iOS 16
// APIs without availability checks, so its pods fail to compile at React
// Native's lower minimum ("'subtitle' is only available in iOS 16.0 or newer").
// Compile just those pods for iOS 16; the app's own minimum is unchanged.
const { withPodfile } = require('expo/config-plugins');

const MARK = '# withContextMenuDeploymentTarget';
const SNIPPET = `
    ${MARK}
    installer.pods_project.targets.each do |t|
      if ['react-native-ios-context-menu', 'react-native-ios-utilities'].include?(t.name)
        t.build_configurations.each do |bc|
          current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0' if current.nil? || current.to_f < 16.0
        end
      end
    end
`;

module.exports = function withContextMenuDeploymentTarget(config) {
  return withPodfile(config, (c) => {
    let src = c.modResults.contents;
    if (!src.includes(MARK)) {
      if (!/post_install do \|installer\|/.test(src)) throw new Error('withContextMenuDeploymentTarget: no post_install block in the Podfile');
      src = src.replace(/post_install do \|installer\|\n/, (m) => m + SNIPPET);
    }
    c.modResults.contents = src;
    return c;
  });
};
