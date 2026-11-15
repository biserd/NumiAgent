import XCTest

final class TabletWorkspaceTests: XCTestCase {
    @MainActor
    func testRotationAndRecordSelection() async throws {
        continueAfterFailure = false
        let device = XCUIDevice.shared
        device.orientation = .portrait
        defer { device.orientation = .portrait }
        let app = XCUIApplication()
        app.launchArguments = ["--preview-collection"]
        app.launch()

        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 15))
        XCTAssertTrue(app.navigationBars["Octavian denarius"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(window.frame.height > window.frame.width)
        capture("collection-portrait")

        device.orientation = .landscapeLeft
        for _ in 0..<30 {
            if window.frame.width > window.frame.height { break }
            try await Task.sleep(for: .milliseconds(500))
        }
        XCTAssertTrue(window.frame.width > window.frame.height, "The iPad window should rotate to landscape.")
        XCTAssertTrue(app.navigationBars["Octavian denarius"].firstMatch.exists)
        let sidebar = app.descendants(matching: .any)["workspace-checklists"].firstMatch
        XCTAssertTrue(sidebar.isHittable)
        let nextSpecimen = app.descendants(matching: .any)["specimen-demo-2"].firstMatch
        XCTAssertTrue(nextSpecimen.isHittable)
        capture("collection-landscape")

        nextSpecimen.tap()
        XCTAssertTrue(app.navigationBars["Mark Antony legionary denarius"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertTrue(nextSpecimen.isHittable, "Selecting a specimen should keep the list visible.")

        sidebar.tap()
        XCTAssertTrue(app.staticTexts["Late Republican denarii"].firstMatch.waitForExistence(timeout: 10))
        app.staticTexts["Late Republican denarii"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["2 of 3 slots filled"].firstMatch.waitForExistence(timeout: 10))
        capture("checklists-landscape")
    }

    @MainActor
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
