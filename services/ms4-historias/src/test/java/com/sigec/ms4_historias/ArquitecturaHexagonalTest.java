package com.sigec.ms4_historias;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(packages = "com.sigec.ms4_historias", importOptions = ImportOption.DoNotIncludeTests.class)
class ArquitecturaHexagonalTest {

	@ArchTest
	static final ArchRule domain_no_depende_de_application_ni_infrastructure = noClasses()
			.that().resideInAPackage("..domain..")
			.should().dependOnClassesThat().resideInAnyPackage("..application..", "..infrastructure..");

	@ArchTest
	static final ArchRule application_no_depende_de_infrastructure = noClasses()
			.that().resideInAPackage("..application..")
			.should().dependOnClassesThat().resideInAPackage("..infrastructure..");

	@ArchTest
	static final ArchRule domain_y_application_sin_frameworks = noClasses()
			.that().resideInAnyPackage("..domain..", "..application..")
			.should().dependOnClassesThat().resideInAnyPackage("org.springframework..", "jakarta.persistence..");
}
