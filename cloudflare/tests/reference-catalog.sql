INSERT INTO catalog_entries VALUES
  (1,'ocre-ric.2.tr.123','coin','RIC II Trajan 123','Trajan','Denarius','','https://numismatics.org/ocre/id/ric.2.tr.123','ocre','ANS and ISAW','ODbL-1.0','Rome 107'),
  (2,'test-banknote','banknote','Ten dollar note','United States','Ten dollars','1914','https://www.si.edu/','smithsonian','Smithsonian','CC0-1.0','Federal Reserve 1914'),
  (3,'ocre-ric.1(2).aug.10','coin','RIC I Augustus 10','Augustus','Denarius','','https://numismatics.org/ocre/id/ric.1(2).aug.10','ocre','ANS and ISAW','ODbL-1.0','Rome');
INSERT INTO catalog_fts(catalog_fts) VALUES('rebuild');
INSERT INTO catalog_release VALUES (1,'test-release',3,'{}');
