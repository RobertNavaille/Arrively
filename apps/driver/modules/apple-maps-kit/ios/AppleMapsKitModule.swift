import ExpoModulesCore
import MapKit

// Apple Maps for the driver app: street routes with drive times (MKDirections)
// and address search (MKLocalSearch). Free on the device, unlike Mapbox calls.
public class AppleMapsKitModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AppleMapsKit")

    // A road route through `points` ([lat, lng] pairs) in order. MKDirections
    // goes from one place to the next, so a longer trip is asked leg by leg.
    // Returns nil when Apple has no route.
    AsyncFunction("route") { (points: [[Double]], mode: String, avoidHighways: Bool, avoidTolls: Bool) async throws -> [String: Any]? in
      guard points.count >= 2 else { return nil }
      var path: [[Double]] = []
      var seconds = 0.0
      var meters = 0.0
      for i in 0..<(points.count - 1) {
        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: MKPlacemark(coordinate: coordinate(points[i])))
        request.destination = MKMapItem(placemark: MKPlacemark(coordinate: coordinate(points[i + 1])))
        request.transportType = mode == "walk" ? .walking : .automobile
        request.departureDate = Date() // drive times with traffic
        if avoidHighways { request.highwayPreference = .avoid }
        if avoidTolls { request.tollPreference = .avoid }
        let response = try await MKDirections(request: request).calculate()
        guard let route = response.routes.first else { return nil }
        var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: route.polyline.pointCount)
        route.polyline.getCoordinates(&coords, range: NSRange(location: 0, length: route.polyline.pointCount))
        path.append(contentsOf: coords.map { [$0.latitude, $0.longitude] })
        seconds += route.expectedTravelTime
        meters += route.distance
      }
      return ["path": path, "durationS": seconds, "distanceM": meters]
    }

    // Street addresses matching `query`, nearest `near` ([lat, lng]) first when given.
    AsyncFunction("search") { (query: String, near: [Double]?) async throws -> [[String: Any]] in
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      request.resultTypes = .address
      if let near, near.count == 2 {
        request.region = MKCoordinateRegion(center: coordinate(near), latitudinalMeters: 50_000, longitudinalMeters: 50_000)
      }
      let response = try await MKLocalSearch(request: request).start()
      return response.mapItems.prefix(5).map { item in
        let p = item.placemark
        let street = [p.subThoroughfare, p.thoroughfare].compactMap { $0 }.joined(separator: " ")
        let state = [p.administrativeArea, p.postalCode].compactMap { $0 }.joined(separator: " ")
        let detail = [p.locality, state].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: ", ")
        return [
          "name": street.isEmpty ? (item.name ?? "Address") : street,
          "detail": detail,
          "lat": p.coordinate.latitude,
          "lng": p.coordinate.longitude,
        ]
      }
    }
  }
}

private func coordinate(_ p: [Double]) -> CLLocationCoordinate2D {
  CLLocationCoordinate2D(latitude: p[0], longitude: p[1])
}
