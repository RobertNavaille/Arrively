Pod::Spec.new do |s|
  s.name           = 'AppleMapsKit'
  s.version        = '0.1.0'
  s.summary        = 'Apple Maps routes and address search for Arrively'
  s.description    = 'MapKit directions (MKDirections) and address search (MKLocalSearch) for the driver app.'
  s.author         = 'Arrively'
  s.homepage       = 'https://arrively-cyan.vercel.app'
  s.license        = { type: 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'MapKit'
  s.source_files   = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
