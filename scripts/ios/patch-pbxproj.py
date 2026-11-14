#!/usr/bin/env python3
"""One-time patch of the Capacitor-generated Xcode project (ios/App/App.xcodeproj/project.pbxproj).

Adds, without Xcode (this repository is developed on Linux; docs/plan/10-ios-build.md):
- to the App target: MainViewController.swift, WidgetBridgePlugin.swift, PrivacyInfo.xcprivacy,
  App.entitlements (App Group), iPhone only, the RUMA_APP_GROUP build setting;
- a WidgetKit app-extension target "RumaWidget" (ios/App/RumaWidget), embedded in the app;
- the minimum iOS raised from Capacitor's 15.0 to 16.4 everywhere (app, widget, project).

Idempotent: running it on an already patched project changes nothing. Kept in the repository as the record
of how the project was changed; it is not part of any build. The first compile of the result happens in CI
(.github/workflows/ios.yml).
"""
import re
import sys
from pathlib import Path

PBX = Path(__file__).resolve().parents[2] / 'ios/App/App.xcodeproj/project.pbxproj'
s = PBX.read_text()
if 'RumaWidget' in s:
    print('already patched')
    sys.exit(0)

def i(n: int) -> str:
    return f'F0A1C0DE0000000000000{n:03X}'

ID = dict(
    mainvc=i(1), mainvc_b=i(0x11), bridge=i(2), bridge_b=i(0x12), app_ent=i(3), app_priv=i(4), app_priv_b=i(0x14),
    appex=i(0x20), w_swift=i(0x21), w_swift_b=i(0x31), w_info=i(0x22), w_ent=i(0x23), w_priv=i(0x24), w_priv_b=i(0x34),
    appex_embed=i(0x30), w_group=i(0x40), w_sources=i(0x41), w_frameworks=i(0x42), w_resources=i(0x43),
    embed_phase=i(0x44), w_target=i(0x45), proxy=i(0x46), dep=i(0x47), w_cfglist=i(0x48), w_debug=i(0x49), w_release=i(0x4A),
)
PROJECT = '504EC2FC1FED79650016851F'
APP_TARGET = '504EC3031FED79650016851F'
APP_GROUP_ID = '504EC3061FED79650016851F'
MAIN_GROUP = '504EC2FB1FED79650016851F'
PRODUCTS = '504EC3051FED79650016851F'
APP_SOURCES = '504EC3001FED79650016851F'
APP_RESOURCES = '504EC3021FED79650016851F'
BUNDLE_ID = 'com.example.jlptruma'  # placeholder, see scripts/ios/set-bundle-id.mjs


def sub(old: str, new: str, count: int = 1):
    global s
    n = s.count(old)
    if n != count:
        raise SystemExit(f'expected {count}× {old!r}, found {n}')
    s = s.replace(old, new)


def before(marker: str, text: str):
    sub(marker, text + marker)


# ── build files and file references ──
before('/* End PBXBuildFile section */', f'''\t\t{ID['mainvc_b']} /* MainViewController.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ID['mainvc']} /* MainViewController.swift */; }};
\t\t{ID['bridge_b']} /* WidgetBridgePlugin.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ID['bridge']} /* WidgetBridgePlugin.swift */; }};
\t\t{ID['app_priv_b']} /* PrivacyInfo.xcprivacy in Resources */ = {{isa = PBXBuildFile; fileRef = {ID['app_priv']} /* PrivacyInfo.xcprivacy */; }};
\t\t{ID['appex_embed']} /* RumaWidget.appex in Embed Foundation Extensions */ = {{isa = PBXBuildFile; fileRef = {ID['appex']} /* RumaWidget.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
\t\t{ID['w_swift_b']} /* RumaWidget.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {ID['w_swift']} /* RumaWidget.swift */; }};
\t\t{ID['w_priv_b']} /* PrivacyInfo.xcprivacy in Resources */ = {{isa = PBXBuildFile; fileRef = {ID['w_priv']} /* PrivacyInfo.xcprivacy */; }};
''')
sub('/* End PBXBuildFile section */\n', '''/* End PBXBuildFile section */

/* Begin PBXContainerItemProxy section */
\t\t%s /* PBXContainerItemProxy */ = {
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = %s /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = %s;
\t\t\tremoteInfo = RumaWidget;
\t\t};
/* End PBXContainerItemProxy section */

/* Begin PBXCopyFilesBuildPhase section */
\t\t%s /* Embed Foundation Extensions */ = {
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "";
\t\t\tdstSubfolderSpec = 13;
\t\t\tfiles = (
\t\t\t\t%s /* RumaWidget.appex in Embed Foundation Extensions */,
\t\t\t);
\t\t\tname = "Embed Foundation Extensions";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t};
/* End PBXCopyFilesBuildPhase section */
''' % (ID['proxy'], PROJECT, ID['w_target'], ID['embed_phase'], ID['appex_embed']))

before('/* End PBXFileReference section */', f'''\t\t{ID['mainvc']} /* MainViewController.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = MainViewController.swift; sourceTree = "<group>"; }};
\t\t{ID['bridge']} /* WidgetBridgePlugin.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = WidgetBridgePlugin.swift; sourceTree = "<group>"; }};
\t\t{ID['app_ent']} /* App.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = App.entitlements; sourceTree = "<group>"; }};
\t\t{ID['app_priv']} /* PrivacyInfo.xcprivacy */ = {{isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; }};
\t\t{ID['appex']} /* RumaWidget.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = RumaWidget.appex; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{ID['w_swift']} /* RumaWidget.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = RumaWidget.swift; sourceTree = "<group>"; }};
\t\t{ID['w_info']} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; }};
\t\t{ID['w_ent']} /* RumaWidget.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = RumaWidget.entitlements; sourceTree = "<group>"; }};
\t\t{ID['w_priv']} /* PrivacyInfo.xcprivacy */ = {{isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; }};
''')

# ── frameworks phase of the widget (empty: Swift imports link WidgetKit and SwiftUI) ──
before('/* End PBXFrameworksBuildPhase section */', f'''\t\t{ID['w_frameworks']} /* Frameworks */ = {{
\t\t\tisa = PBXFrameworksBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
''')

# ── groups ──
sub(f'''\t\t\t\t504EC3061FED79650016851F /* App */,
\t\t\t\t504EC3051FED79650016851F /* Products */,''', f'''\t\t\t\t504EC3061FED79650016851F /* App */,
\t\t\t\t{ID['w_group']} /* RumaWidget */,
\t\t\t\t504EC3051FED79650016851F /* Products */,''')
sub('''\t\t\t\t504EC3041FED79650016851F /* App.app */,
''', f'''\t\t\t\t504EC3041FED79650016851F /* App.app */,
\t\t\t\t{ID['appex']} /* RumaWidget.appex */,
''')
sub('''\t\t\t\t504EC3071FED79650016851F /* AppDelegate.swift */,
''', f'''\t\t\t\t504EC3071FED79650016851F /* AppDelegate.swift */,
\t\t\t\t{ID['mainvc']} /* MainViewController.swift */,
\t\t\t\t{ID['bridge']} /* WidgetBridgePlugin.swift */,
\t\t\t\t{ID['app_ent']} /* App.entitlements */,
\t\t\t\t{ID['app_priv']} /* PrivacyInfo.xcprivacy */,
''')
before('/* End PBXGroup section */', f'''\t\t{ID['w_group']} /* RumaWidget */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{ID['w_swift']} /* RumaWidget.swift */,
\t\t\t\t{ID['w_info']} /* Info.plist */,
\t\t\t\t{ID['w_ent']} /* RumaWidget.entitlements */,
\t\t\t\t{ID['w_priv']} /* PrivacyInfo.xcprivacy */,
\t\t\t);
\t\t\tpath = RumaWidget;
\t\t\tsourceTree = "<group>";
\t\t}};
''')

# ── targets ──
sub('''\t\t\t\t504EC3021FED79650016851F /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = App;''', f'''\t\t\t\t504EC3021FED79650016851F /* Resources */,
\t\t\t\t{ID['embed_phase']} /* Embed Foundation Extensions */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t\t{ID['dep']} /* PBXTargetDependency */,
\t\t\t);
\t\t\tname = App;''')
before('/* End PBXNativeTarget section */', f'''\t\t{ID['w_target']} /* RumaWidget */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {ID['w_cfglist']} /* Build configuration list for PBXNativeTarget "RumaWidget" */;
\t\t\tbuildPhases = (
\t\t\t\t{ID['w_sources']} /* Sources */,
\t\t\t\t{ID['w_frameworks']} /* Frameworks */,
\t\t\t\t{ID['w_resources']} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = RumaWidget;
\t\t\tproductName = RumaWidget;
\t\t\tproductReference = {ID['appex']} /* RumaWidget.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t}};
''')
sub('''\t\t\t\t\t504EC3031FED79650016851F = {
\t\t\t\t\t\tCreatedOnToolsVersion = 9.2;
\t\t\t\t\t\tLastSwiftMigration = 1100;
\t\t\t\t\t\tProvisioningStyle = Automatic;
\t\t\t\t\t};
''', f'''\t\t\t\t\t504EC3031FED79650016851F = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 9.2;
\t\t\t\t\t\tLastSwiftMigration = 1100;
\t\t\t\t\t\tProvisioningStyle = Automatic;
\t\t\t\t\t}};
\t\t\t\t\t{ID['w_target']} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 26.0;
\t\t\t\t\t\tProvisioningStyle = Automatic;
\t\t\t\t\t}};
''')
sub('''\t\t\t\t504EC3031FED79650016851F /* App */,
\t\t\t);
\t\t};
/* End PBXProject section */''', f'''\t\t\t\t504EC3031FED79650016851F /* App */,
\t\t\t\t{ID['w_target']} /* RumaWidget */,
\t\t\t);
\t\t}};
/* End PBXProject section */''')

# ── build phases ──
sub('''\t\t\t\t504EC30D1FED79650016851F /* Main.storyboard in Resources */,
''', f'''\t\t\t\t504EC30D1FED79650016851F /* Main.storyboard in Resources */,
\t\t\t\t{ID['app_priv_b']} /* PrivacyInfo.xcprivacy in Resources */,
''')
before('/* End PBXResourcesBuildPhase section */', f'''\t\t{ID['w_resources']} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{ID['w_priv_b']} /* PrivacyInfo.xcprivacy in Resources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
''')
sub('''\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,
''', f'''\t\t\t\t9582B6832FE993A70072D4E8 /* SceneDelegate.swift in Sources */,
\t\t\t\t{ID['mainvc_b']} /* MainViewController.swift in Sources */,
\t\t\t\t{ID['bridge_b']} /* WidgetBridgePlugin.swift in Sources */,
''')
before('/* End PBXSourcesBuildPhase section */', f'''\t\t{ID['w_sources']} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{ID['w_swift_b']} /* RumaWidget.swift in Sources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
''')
sub('/* End PBXSourcesBuildPhase section */\n', f'''/* End PBXSourcesBuildPhase section */

/* Begin PBXTargetDependency section */
\t\t{ID['dep']} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {ID['w_target']} /* RumaWidget */;
\t\t\ttargetProxy = {ID['proxy']} /* PBXContainerItemProxy */;
\t\t}};
/* End PBXTargetDependency section */
''')

# ── build settings ──
# project level: the App Group id, shared by both targets (Info.plist RumaAppGroup and the entitlements)
sub('\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n\t\t\t\tMTL_ENABLE_DEBUG_INFO = YES;',
    f'\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n\t\t\t\tMTL_ENABLE_DEBUG_INFO = YES;\n\t\t\t\tRUMA_APP_GROUP = group.{BUNDLE_ID};')
sub('\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n\t\t\t\tMTL_ENABLE_DEBUG_INFO = NO;',
    f'\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 15.0;\n\t\t\t\tMTL_ENABLE_DEBUG_INFO = NO;\n\t\t\t\tRUMA_APP_GROUP = group.{BUNDLE_ID};')
# app target: entitlements, iPhone only (06 decision 7)
sub('\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;',
    '\t\t\t\tASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;', count=2)
sub('\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";', '\t\t\t\tTARGETED_DEVICE_FAMILY = 1;', count=2)


def widget_config(cid: str, name: str, debug: bool) -> str:
    cond = '\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;\n' if debug else '\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = "";\n'
    return f'''\t\t{cid} /* {name} */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tAPPLICATION_EXTENSION_API_ONLY = YES;
\t\t\t\tCODE_SIGN_ENTITLEMENTS = RumaWidget/RumaWidget.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tINFOPLIST_FILE = RumaWidget/Info.plist;
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 15.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t\t"@executable_path/../../Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID}.widget;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSKIP_INSTALL = YES;
{cond}\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = 1;
\t\t\t}};
\t\t\tname = {name};
\t\t}};
'''


before('/* End XCBuildConfiguration section */', widget_config(ID['w_debug'], 'Debug', True) + widget_config(ID['w_release'], 'Release', False))
before('/* End XCConfigurationList section */', f'''\t\t{ID['w_cfglist']} /* Build configuration list for PBXNativeTarget "RumaWidget" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{ID['w_debug']} /* Debug */,
\t\t\t\t{ID['w_release']} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
''')

# Korean as the development language (the app is Korean only)
sub('\t\t\tdevelopmentRegion = en;', '\t\t\tdevelopmentRegion = ko;')
sub('\t\t\tknownRegions = (\n\t\t\t\ten,\n\t\t\t\tBase,\n\t\t\t);', '\t\t\tknownRegions = (\n\t\t\t\ten,\n\t\t\t\tko,\n\t\t\t\tBase,\n\t\t\t);')

# minimum iOS 16.4 for the app and the widget (Capacitor generates 15.0): the web layer's styles need Safari 16.4
# (docs/design-system.md §8). `npm run ios:sync` reads this to write CapApp-SPM/Package.swift's platform (.v16).
s = s.replace('IPHONEOS_DEPLOYMENT_TARGET = 15.0;', 'IPHONEOS_DEPLOYMENT_TARGET = 16.4;')

PBX.write_text(s)
print('patched', PBX)
