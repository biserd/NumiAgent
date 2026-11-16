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
        let checklist = app.buttons["Late Republican denarii"].firstMatch
        XCTAssertTrue(checklist.waitForExistence(timeout: 10))
        checklist.tap()
        XCTAssertTrue(app.navigationBars["Late Republican denarii"].firstMatch.waitForExistence(timeout: 10))
        let missingSlot = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "Sextus Pompey")).firstMatch
        XCTAssertTrue(missingSlot.waitForExistence(timeout: 10))
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

final class PhoneSignInAndReviewTests: XCTestCase {
    @MainActor
    func testPhotoDraftAcceptsAnotherViewBeforeIdentification() {
        let app = XCUIApplication()
        app.launchArguments = ["--preview-photo-review"]
        app.launch()
        let preview = app.buttons["Preview a photo draft"]
        XCTAssertTrue(preview.waitForExistence(timeout: 15))
        preview.tap()
        XCTAssertTrue(app.staticTexts["2 photos in this draft"].firstMatch.waitForExistence(timeout: 10))
        app.buttons["Add a sample close-up"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["3 photos in this draft"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.navigationBars["Example photo batch"].exists)
        let identify = app.buttons["Identify"].firstMatch
        XCTAssertTrue(identify.isHittable)

        app.swipeUp()
        XCTAssertTrue(app.descendants(matching: .any)["replace-photo-1"].firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["replace-photo-2"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["draft-photo-3"].firstMatch.exists)
        identify.tap()
        XCTAssertTrue(app.navigationBars["Example photo batch"].firstMatch.waitForExistence(timeout: 10))
    }

    @MainActor
    func testSignInAndSavedPhotoActionsAreVisible() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--preview-sign-in"]
        app.launch()

        let request = app.buttons["Send sign-in link"].firstMatch
        XCTAssertTrue(request.waitForExistence(timeout: 15))
        XCTAssertTrue(request.isHittable)
        XCTAssertTrue(app.buttons["Explore the demo"].firstMatch.isHittable)
        app.buttons["I already have a link"].firstMatch.tap()
        XCTAssertTrue(app.secureTextFields["Paste sign-in link"].firstMatch.waitForExistence(timeout: 10))

        app.terminate()
        app.launchArguments = ["--preview-photo-review"]
        app.launch()
        let openBatch = app.buttons["Open example photo batch"].firstMatch
        XCTAssertTrue(openBatch.waitForExistence(timeout: 15))
        openBatch.tap()
        XCTAssertTrue(app.staticTexts["1 added to your collection"].firstMatch.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Catalog manually"].exists)
        let viewRecord = app.buttons["View record"].firstMatch
        if !viewRecord.isHittable { app.swipeUp() }
        XCTAssertTrue(viewRecord.isHittable)
        viewRecord.tap()
        XCTAssertTrue(app.navigationBars["Bank of Canada one-dollar note"].firstMatch.waitForExistence(timeout: 10))
        app.navigationBars.buttons.firstMatch.tap()
        let uncertain = app.staticTexts["Review details"].firstMatch
        if !uncertain.isHittable { app.swipeUp() }
        XCTAssertTrue(uncertain.waitForExistence(timeout: 10))
    }
}
